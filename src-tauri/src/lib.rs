mod google;

use tauri_plugin_sql::{Migration, MigrationKind};

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
    ];

    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
