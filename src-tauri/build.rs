fn main() {
    // .env 파일 변경 시 Cargo가 자동 재컴파일하도록 설정
    println!("cargo:rerun-if-changed=.env");

    // 로컬 개발: src-tauri/.env 파일에서 읽기
    let env_path = std::path::Path::new(".env");
    if env_path.exists() {
        if let Ok(content) = std::fs::read_to_string(env_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, val)) = line.split_once('=') {
                    println!("cargo:rustc-env={}={}", key.trim(), val.trim());
                }
            }
        }
    }

    // CI/CD: 환경변수에서 직접 읽기 (.env 파일 없는 경우)
    for key in &["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SUPABASE_APP_EMAIL", "SUPABASE_APP_PASSWORD"] {
        if let Ok(val) = std::env::var(key) {
            println!("cargo:rustc-env={}={}", key, val);
        }
    }

    tauri_build::build()
}
