// Google OAuth + userinfo helpers for MallBook.
// Loopback PKCE flow. Refresh token persisted via `keyring`.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use keyring::Entry;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

// 컴파일 시점에 src-tauri/.env 에서 주입 (build.rs 참고)
// JS 번들에 포함되지 않음
const CLIENT_ID: &str = env!("GOOGLE_CLIENT_ID");
const CLIENT_SECRET: &str = env!("GOOGLE_CLIENT_SECRET");

const KEYRING_SERVICE: &str = "mallbook";
const KEYRING_USER: &str = "google_refresh_token";
const KEYRING_EMAIL: &str = "google_email";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES: &str = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file openid email";
const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";
const BACKUP_FILENAME: &str = "mallbook_backup.db";

#[derive(Debug, Serialize, Clone)]
pub struct GoogleTokens {
    pub access_token: String,
    pub expires_at_ms: i64,
    pub email: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<i64>,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UserInfo {
    email: Option<String>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn b64url(bytes: &[u8]) -> String {
    // URL-safe base64 without padding.
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 4);
    let mut i = 0;
    while i + 3 <= bytes.len() {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8) | (bytes[i + 2] as u32);
        out.push(CHARS[((n >> 18) & 0x3f) as usize] as char);
        out.push(CHARS[((n >> 12) & 0x3f) as usize] as char);
        out.push(CHARS[((n >> 6) & 0x3f) as usize] as char);
        out.push(CHARS[(n & 0x3f) as usize] as char);
        i += 3;
    }
    let rem = bytes.len() - i;
    if rem == 1 {
        let n = (bytes[i] as u32) << 16;
        out.push(CHARS[((n >> 18) & 0x3f) as usize] as char);
        out.push(CHARS[((n >> 12) & 0x3f) as usize] as char);
    } else if rem == 2 {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8);
        out.push(CHARS[((n >> 18) & 0x3f) as usize] as char);
        out.push(CHARS[((n >> 12) & 0x3f) as usize] as char);
        out.push(CHARS[((n >> 6) & 0x3f) as usize] as char);
    }
    out
}

fn random_b64url(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    b64url(&buf)
}

fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        let safe = (b as char).is_ascii_alphanumeric()
            || matches!(b, b'-' | b'_' | b'.' | b'~');
        if safe {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

fn refresh_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| format!("keyring init: {e}"))
}
fn email_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_EMAIL).map_err(|e| format!("keyring init: {e}"))
}

fn store_refresh_token(value: &str) -> Result<(), String> {
    refresh_entry()?
        .set_password(value)
        .map_err(|e| format!("keyring set: {e}"))
}
fn load_refresh_token() -> Result<Option<String>, String> {
    match refresh_entry()?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring get: {e}")),
    }
}
fn clear_refresh_token() -> Result<(), String> {
    match refresh_entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete: {e}")),
    }
}

fn store_email(value: &str) -> Result<(), String> {
    email_entry()?
        .set_password(value)
        .map_err(|e| format!("keyring set: {e}"))
}
fn load_email() -> Option<String> {
    email_entry().ok().and_then(|e| e.get_password().ok())
}
fn clear_email() {
    if let Ok(e) = email_entry() {
        let _ = e.delete_credential();
    }
}

// --- minimal loopback HTTP server (blocking) ---
// Reads the first HTTP request line to extract the callback query params.
fn run_loopback_server(timeout: Duration) -> Result<(u16, std::sync::mpsc::Receiver<String>), String> {
    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .map_err(|e| format!("bind: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?
        .port();
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    listener
        .set_nonblocking(false)
        .map_err(|e| format!("set_blocking: {e}"))?;

    std::thread::spawn(move || {
        let deadline = Instant::now() + timeout;
        listener
            .set_nonblocking(true)
            .ok();
        loop {
            if Instant::now() >= deadline {
                let _ = tx.send(String::new());
                return;
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    // first line: "GET /callback?code=... HTTP/1.1"
                    let first = req.lines().next().unwrap_or("").to_string();
                    let path = first.split_whitespace().nth(1).unwrap_or("").to_string();
                    let body = b"<!doctype html><meta charset=utf-8><title>MallBook</title><body style=\"font-family:system-ui;padding:40px;text-align:center\"><h2>\xEC\x9D\xB8\xEC\xA6\x9D\xEC\x9D\xB4 \xEC\x99\x84\xEB\xA3\x8C\xEB\x90\x98\xEC\x97\x88\xEC\x8A\xB5\xEB\x8B\x88\xEB\x8B\xA4.</h2><p>\xEC\x9D\xB4 \xEC\xB0\xBD\xEC\x9D\x84 \xEB\x8B\xAB\xEA\xB3\xA0 \xEC\x95\xB1\xEC\x9C\xBC\xEB\xA1\x9C \xEB\x8F\x8C\xEC\x95\x84\xEA\xB0\x80\xEC\x84\xB8\xEC\x9A\x94.</p></body>";
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.write_all(body);
                    let _ = stream.flush();
                    let _ = tx.send(path);
                    return;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
                Err(e) => {
                    let _ = tx.send(format!("__error__:{e}"));
                    return;
                }
            }
        }
    });

    // prevent unused warning
    let _ = TcpStream::connect("127.0.0.1:0");
    Ok((port, rx))
}

fn parse_query(path: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    let q = match path.split_once('?') {
        Some((_, q)) => q,
        None => return map,
    };
    for pair in q.split('&') {
        let mut it = pair.splitn(2, '=');
        let k = it.next().unwrap_or("").to_string();
        let v = it.next().unwrap_or("").to_string();
        map.insert(url_decode(&k), url_decode(&v));
    }
    map
}

fn url_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16).unwrap_or(0);
                let lo = (bytes[i + 2] as char).to_digit(16).unwrap_or(0);
                out.push(((hi << 4) | lo) as u8);
                i += 3;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<(TokenResponse, String), String> {
    let client = reqwest::Client::new();
    let form = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];
    let resp = client
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("token request: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("token exchange failed ({status}): {text}"));
    }
    let tokens: TokenResponse = serde_json::from_str(&text)
        .map_err(|e| format!("token parse: {e} / body={text}"))?;

    // Fetch email
    let ui = client
        .get(USERINFO_URL)
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(|e| format!("userinfo request: {e}"))?;
    let email = if ui.status().is_success() {
        ui.json::<UserInfo>()
            .await
            .ok()
            .and_then(|u| u.email)
            .unwrap_or_default()
    } else {
        String::new()
    };
    Ok((tokens, email))
}

async fn refresh_access(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let form = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    let resp = client
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("refresh request: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("refresh failed ({status}): {text}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("refresh parse: {e}"))
}

#[tauri::command]
pub async fn google_oauth_start(
    app: tauri::AppHandle,
) -> Result<GoogleTokens, String> {
    let client_id = CLIENT_ID;
    let client_secret = CLIENT_SECRET;

    // PKCE
    let verifier = random_b64url(64);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = b64url(&hasher.finalize());
    let state = random_b64url(16);

    // Spawn loopback first so we know the port for the redirect URI.
    let (port, rx) = run_loopback_server(Duration::from_secs(300))?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let auth = format!(
        "{AUTH_URL}?response_type=code&client_id={cid}&redirect_uri={ru}&scope={sc}&code_challenge={ch}&code_challenge_method=S256&state={st}&access_type=offline&prompt=consent",
        cid = url_encode(&client_id),
        ru = url_encode(&redirect_uri),
        sc = url_encode(SCOPES),
        ch = url_encode(&challenge),
        st = url_encode(&state),
    );

    app.opener()
        .open_url(&auth, None::<&str>)
        .map_err(|e| format!("open browser: {e}"))?;

    // Wait for the callback on a blocking task.
    let path = tokio::task::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(320))
            .unwrap_or_default()
    })
    .await
    .map_err(|e| format!("join: {e}"))?;

    if path.is_empty() {
        return Err("OAuth timed out".into());
    }
    if path.starts_with("__error__:") {
        return Err(path.replace("__error__:", "loopback error: "));
    }
    let params = parse_query(&path);
    if params.get("state").map(String::as_str) != Some(state.as_str()) {
        return Err("state mismatch".into());
    }
    if let Some(err) = params.get("error") {
        return Err(format!("OAuth error: {err}"));
    }
    let code = params
        .get("code")
        .cloned()
        .ok_or_else(|| "code missing".to_string())?;

    let (tokens, email) = exchange_code(&client_id, &client_secret, &code, &verifier, &redirect_uri).await?;
    if let Some(rt) = tokens.refresh_token.as_deref() {
        store_refresh_token(rt)?;
    } else {
        return Err("refresh_token not returned (try prompt=consent)".into());
    }
    if !email.is_empty() {
        store_email(&email)?;
    }
    let expires_at_ms = now_ms() + tokens.expires_in.unwrap_or(3600) * 1000;
    Ok(GoogleTokens {
        access_token: tokens.access_token,
        expires_at_ms,
        email,
    })
}

#[tauri::command]
pub async fn google_get_access_token() -> Result<GoogleTokens, String> {
    let rt = load_refresh_token()?.ok_or_else(|| "not_connected".to_string())?;
    let tokens = refresh_access(CLIENT_ID, CLIENT_SECRET, &rt).await?;
    let email = load_email().unwrap_or_default();
    let expires_at_ms = now_ms() + tokens.expires_in.unwrap_or(3600) * 1000;
    Ok(GoogleTokens {
        access_token: tokens.access_token,
        expires_at_ms,
        email,
    })
}

#[tauri::command]
pub async fn google_disconnect() -> Result<(), String> {
    clear_refresh_token()?;
    clear_email();
    Ok(())
}

#[tauri::command]
pub async fn google_is_connected() -> Result<bool, String> {
    Ok(load_refresh_token()?.is_some())
}

// ── Google Drive 백업 / 복원 ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DriveFileList {
    files: Vec<DriveFile>,
}

#[derive(Debug, Deserialize)]
struct DriveFile {
    id: String,
}

#[derive(Debug, Serialize)]
struct DriveCreateMeta {
    name: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
}

async fn drive_find_backup(access_token: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let q = format!("name='{}' and trashed=false", BACKUP_FILENAME);
    let resp = client
        .get(DRIVE_FILES_URL)
        .bearer_auth(access_token)
        .query(&[("q", q.as_str()), ("spaces", "drive"), ("fields", "files(id)")])
        .send()
        .await
        .map_err(|e| format!("drive list: {e}"))?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("drive list failed: {text}"));
    }
    let list: DriveFileList = resp.json().await.map_err(|e| format!("drive list parse: {e}"))?;
    Ok(list.files.into_iter().next().map(|f| f.id))
}

#[tauri::command]
pub async fn drive_backup_db(
    app: tauri::AppHandle,
) -> Result<String, String> {
    // 액세스 토큰 갱신
    let tokens = google_get_access_token().await?;
    let access_token = tokens.access_token;

    // DB 파일 읽기
    let db_path: PathBuf = app
        .path()
        .app_data_dir()
        .map(|p| p.join("mallbook.db"))
        .map_err(|e: tauri::Error| e.to_string())?;
    let db_bytes = std::fs::read(&db_path).map_err(|e| format!("db read: {e}"))?;

    let client = reqwest::Client::new();

    // 기존 백업 파일 ID 조회
    let existing_id = drive_find_backup(&access_token).await?;

    if let Some(file_id) = existing_id {
        // 기존 파일 업데이트 (PATCH)
        let url = format!("{DRIVE_UPLOAD_URL}/{file_id}?uploadType=media");
        let resp = client
            .patch(&url)
            .bearer_auth(&access_token)
            .header("Content-Type", "application/x-sqlite3")
            .body(db_bytes)
            .send()
            .await
            .map_err(|e| format!("drive update: {e}"))?;
        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("drive update failed: {text}"));
        }
    } else {
        // 새 파일 생성 (multipart)
        let boundary = "mallbook_boundary_abc123";
        let meta = serde_json::to_string(&DriveCreateMeta {
            name: BACKUP_FILENAME.to_string(),
            mime_type: "application/x-sqlite3".to_string(),
        })
        .map_err(|e| e.to_string())?;

        let mut body: Vec<u8> = Vec::new();
        body.extend_from_slice(format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").as_bytes());
        body.extend_from_slice(meta.as_bytes());
        body.extend_from_slice(format!("\r\n--{boundary}\r\nContent-Type: application/x-sqlite3\r\n\r\n").as_bytes());
        body.extend_from_slice(&db_bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());

        let resp = client
            .post(format!("{DRIVE_UPLOAD_URL}?uploadType=multipart"))
            .bearer_auth(&access_token)
            .header("Content-Type", format!("multipart/related; boundary={boundary}"))
            .body(body)
            .send()
            .await
            .map_err(|e| format!("drive create: {e}"))?;
        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("drive create failed: {text}"));
        }
    }

    Ok("백업이 완료되었습니다.".to_string())
}

#[tauri::command]
pub async fn drive_restore_db(
    app: tauri::AppHandle,
) -> Result<String, String> {
    let tokens = google_get_access_token().await?;
    let access_token = tokens.access_token;

    let file_id = drive_find_backup(&access_token)
        .await?
        .ok_or_else(|| "드라이브에 백업 파일이 없습니다.".to_string())?;

    let client = reqwest::Client::new();
    let url = format!("{DRIVE_FILES_URL}/{file_id}?alt=media");
    let resp = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("drive download: {e}"))?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("drive download failed: {text}"));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("drive read bytes: {e}"))?;

    let db_path: PathBuf = app
        .path()
        .app_data_dir()
        .map(|p| p.join("mallbook.db"))
        .map_err(|e: tauri::Error| e.to_string())?;

    // 현재 DB를 .bak으로 임시 보존 후 덮어쓰기
    let bak_path = db_path.with_extension("db.bak");
    if db_path.exists() {
        std::fs::copy(&db_path, &bak_path).map_err(|e| format!("bak copy: {e}"))?;
    }
    std::fs::write(&db_path, &bytes).map_err(|e| format!("db write: {e}"))?;

    Ok("복원이 완료되었습니다. 앱을 재시작하면 변경사항이 적용됩니다.".to_string())
}
