mod google;
mod telegram;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{async_runtime, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

// ── 봇 생명주기 관리 ────────────────────────────────────────────────────────
struct BotHandle(Mutex<Option<async_runtime::JoinHandle<()>>>);

impl BotHandle {
    fn new() -> Self {
        BotHandle(Mutex::new(None))
    }

    fn restart(&self, token: String, db_path: PathBuf) {
        let mut guard = self.0.lock().unwrap();
        if let Some(h) = guard.take() {
            h.abort();
        }
        if !token.is_empty() {
            *guard = Some(async_runtime::spawn(telegram::run_bot(token, db_path)));
        }
    }

    fn stop(&self) {
        let mut guard = self.0.lock().unwrap();
        if let Some(h) = guard.take() {
            h.abort();
        }
    }
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────
fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("mallbook.db"))
        .map_err(|e| e.to_string())
}

fn read_bot_token(db_path: &PathBuf) -> Option<String> {
    let conn = rusqlite::Connection::open(db_path).ok()?;
    conn.query_row(
        "SELECT bot_telegram_token FROM users ORDER BY created_at ASC LIMIT 1",
        [],
        |r| r.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
    .filter(|t| !t.is_empty())
}

// ── Tauri 커맨드 ──────────────────────────────────────────────────────────
#[tauri::command]
fn bot_set_token(token: String, app: tauri::AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    let val: Option<&str> = if token.is_empty() { None } else { Some(&token) };
    conn.execute(
        "UPDATE users SET bot_telegram_token = ?1 WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)",
        rusqlite::params![val],
    )
    .map_err(|e| e.to_string())?;

    let state = app.state::<BotHandle>();
    if token.is_empty() {
        state.stop();
    } else {
        state.restart(token, db_path);
    }
    Ok(())
}

#[tauri::command]
fn bot_get_token(app: tauri::AppHandle) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    Ok(read_bot_token(&db_path).unwrap_or_default())
}

/// 앱 시작 시 프론트엔드에서 DB 초기화 완료 후 호출
#[tauri::command]
fn bot_start_if_configured(app: tauri::AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    if let Some(token) = read_bot_token(&db_path) {
        let state = app.state::<BotHandle>();
        state.restart(token, db_path);
    }
    Ok(())
}

// ── 앱 진입점 ────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init schema",
            sql: include_str!("../migrations/20260414000001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add google sheet fields",
            sql: include_str!("../migrations/20260414000002_add_google_sheet.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "products and commission",
            sql: include_str!("../migrations/20260414000003_products_and_commission.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add telegram bot token",
            sql: include_str!("../migrations/20260415000004_add_telegram_bot.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(BotHandle::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:mallbook.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            google::google_oauth_start,
            google::google_get_access_token,
            google::google_disconnect,
            google::google_is_connected,
            bot_set_token,
            bot_get_token,
            bot_start_if_configured,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
