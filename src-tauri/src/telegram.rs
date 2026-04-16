use reqwest::Client;
use rusqlite::Connection;
use serde::Deserialize;
use std::path::PathBuf;

fn read_allowed_chat_id(db_path: &PathBuf) -> Option<i64> {
    let conn = rusqlite::Connection::open(db_path).ok()?;
    conn.query_row(
        "SELECT telegram_allowed_chat_id FROM users ORDER BY created_at ASC LIMIT 1",
        [],
        |r| r.get::<_, Option<i64>>(0),
    )
    .ok()
    .flatten()
}

fn write_allowed_chat_id(db_path: &PathBuf, chat_id: i64) {
    if let Ok(conn) = rusqlite::Connection::open(db_path) {
        let _ = conn.execute(
            "UPDATE users SET telegram_allowed_chat_id = ?1 \
             WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)",
            rusqlite::params![chat_id],
        );
    }
}

const HELP: &str = "📦 *MallBook 명령어*\n\n/today \\- 오늘 요약\n/month \\- 이번달 현황\n/unpaid \\- 미수금 현황\n/due \\- 오늘 줄 돈\n/stock \\- 재고 부족\n/tax \\- 부가세 현황";

#[derive(Deserialize)]
struct TgResponse<T> {
    result: Option<T>,
}

#[derive(Deserialize)]
struct Update {
    update_id: i64,
    message: Option<TgMessage>,
}

#[derive(Deserialize)]
struct TgMessage {
    chat: TgChat,
    text: Option<String>,
}

#[derive(Deserialize)]
struct TgChat {
    id: i64,
}

fn krw(n: f64) -> String {
    let n = n as i64;
    let abs = n.unsigned_abs();
    let s = abs.to_string();
    let mut result = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push(',');
        }
        result.push(c);
    }
    let formatted: String = result.chars().rev().collect();
    if n < 0 {
        format!("\\-₩{}", formatted)
    } else {
        format!("₩{}", formatted)
    }
}

fn julian_day(date: &str) -> i64 {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return 0;
    }
    let y: i64 = parts[0].parse().unwrap_or(0);
    let m: i64 = parts[1].parse().unwrap_or(0);
    let d: i64 = parts[2].parse().unwrap_or(0);
    let a = (14 - m) / 12;
    let ya = y + 4800 - a;
    let ma = m + 12 * a - 3;
    d + (153 * ma + 2) / 5 + 365 * ya + ya / 4 - ya / 100 + ya / 400 - 32045
}

fn days_between(d1: &str, d2: &str) -> i64 {
    julian_day(d1) - julian_day(d2)
}

async fn send_msg(client: &Client, token: &str, chat_id: i64, text: &str) {
    let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
    let _ = client
        .post(&url)
        .json(&serde_json::json!({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "MarkdownV2"
        }))
        .send()
        .await;
}

fn q_today(db: &Connection) -> String {
    let today: String = db
        .query_row("SELECT date('now','localtime')", [], |r| r.get(0))
        .unwrap_or_default();

    let mut stmt = match db.prepare(
        "SELECT type, COALESCE(SUM(amount),0), COUNT(*) FROM transactions WHERE date=?1 GROUP BY type",
    ) {
        Ok(s) => s,
        Err(e) => return format!("❌ DB 오류: {}", e),
    };

    let mut sales = 0f64;
    let mut expense = 0f64;
    let mut count = 0i64;
    let _ = stmt.query_map(rusqlite::params![today], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, i64>(2)?))
    }).map(|rows| {
        for row in rows.flatten() {
            count += row.2;
            match row.0.as_str() {
                "sale" => sales += row.1,
                _ => expense += row.1,
            }
        }
    });

    format!(
        "📅 *{}* 오늘 요약\n\n💚 매출: {}\n🔴 지출·매입: {}\n━━━━━━━━━━\n💰 순이익: {}\n📋 거래 건수: {}건",
        today.replace('-', "\\-"),
        krw(sales),
        krw(expense),
        krw(sales - expense),
        count
    )
}

fn q_month(db: &Connection) -> String {
    let month: String = db
        .query_row("SELECT substr(date('now','localtime'),1,7)", [], |r| r.get(0))
        .unwrap_or_default();

    let mut stmt = match db.prepare(
        "SELECT type, COALESCE(SUM(amount),0), COUNT(*) FROM transactions WHERE substr(date,1,7)=?1 GROUP BY type",
    ) {
        Ok(s) => s,
        Err(e) => return format!("❌ DB 오류: {}", e),
    };

    let mut sales = 0f64;
    let mut expense = 0f64;
    let mut count = 0i64;
    let _ = stmt.query_map(rusqlite::params![month], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, i64>(2)?))
    }).map(|rows| {
        for row in rows.flatten() {
            count += row.2;
            match row.0.as_str() {
                "sale" => sales += row.1,
                _ => expense += row.1,
            }
        }
    });

    format!(
        "📊 *{}* 이번달 현황\n\n💚 매출: {}\n🔴 지출·매입: {}\n━━━━━━━━━━\n💰 순이익: {}\n📋 거래 건수: {}건",
        month.replace('-', "\\-"),
        krw(sales),
        krw(expense),
        krw(sales - expense),
        count
    )
}

fn q_unpaid(db: &Connection) -> String {
    let today: String = db
        .query_row("SELECT date('now','localtime')", [], |r| r.get(0))
        .unwrap_or_default();

    let mut stmt = match db.prepare(
        "SELECT COALESCE(c.name,'(거래처 없음)'), COALESCE(SUM(t.amount),0), MIN(t.date)
         FROM transactions t
         LEFT JOIN counterparties c ON c.id=t.counterparty_id
         WHERE t.type='sale' AND t.payment_status='pending'
         GROUP BY t.counterparty_id ORDER BY MIN(t.date) ASC",
    ) {
        Ok(s) => s,
        Err(e) => return format!("❌ DB 오류: {}", e),
    };

    let rows: Vec<(String, f64, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map(|iter| iter.flatten().collect())
        .unwrap_or_default();

    if rows.is_empty() {
        return "✅ 미수금 없음".to_string();
    }

    let total: f64 = rows.iter().map(|r| r.1).sum();
    let lines: Vec<String> = rows
        .iter()
        .map(|(name, amount, earliest)| {
            let days = days_between(&today, earliest);
            let badge = if days >= 30 { "🔴" } else if days >= 7 { "🟡" } else { "⚪" };
            format!("{} {}: {} \\({}일 경과\\)", badge, name, krw(*amount), days)
        })
        .collect();

    format!("💸 *미수금 현황*\n\n{}\n\n합계: {}", lines.join("\n"), krw(total))
}

fn q_due(db: &Connection) -> String {
    let mut stmt = match db.prepare(
        "SELECT COALESCE(c.name,'(거래처 없음)'), COALESCE(SUM(t.amount),0)
         FROM transactions t
         LEFT JOIN counterparties c ON c.id=t.counterparty_id
         WHERE t.date=date('now','localtime') AND t.type='purchase' AND t.payment_status='pending'
         AND t.counterparty_id IS NOT NULL
         GROUP BY t.counterparty_id",
    ) {
        Ok(s) => s,
        Err(e) => return format!("❌ DB 오류: {}", e),
    };

    let rows: Vec<(String, f64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map(|iter| iter.flatten().collect())
        .unwrap_or_default();

    if rows.is_empty() {
        return "✅ 오늘 줄 돈 없음".to_string();
    }

    let total: f64 = rows.iter().map(|r| r.1).sum();
    let lines: Vec<String> = rows
        .iter()
        .map(|(n, a)| format!("• {}: {}", n, krw(*a)))
        .collect();

    format!("💴 *오늘 줄 돈*\n\n{}\n\n합계: {}", lines.join("\n"), krw(total))
}

fn q_stock(db: &Connection) -> String {
    let mut stmt = match db.prepare(
        "SELECT name, color, stock FROM products WHERE stock <= 5 AND is_deleted = 0 ORDER BY stock ASC",
    ) {
        Ok(s) => s,
        Err(e) => return format!("❌ DB 오류: {}", e),
    };

    let rows: Vec<(String, Option<String>, i64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map(|iter| iter.flatten().collect())
        .unwrap_or_default();

    if rows.is_empty() {
        return "✅ 재고 부족 상품 없음".to_string();
    }

    let lines: Vec<String> = rows
        .iter()
        .map(|(n, c, s)| {
            let color = c.as_deref().map(|c| format!(" \\({}\\)", c)).unwrap_or_default();
            if *s == 0 {
                format!("🔴 품절 — {}{}", n, color)
            } else {
                format!("🟡 {}개 — {}{}", s, n, color)
            }
        })
        .collect();

    format!("📦 *재고 부족* \\(5개 이하\\)\n\n{}", lines.join("\n"))
}

fn q_tax(db: &Connection) -> String {
    let today: String = db
        .query_row("SELECT date('now','localtime')", [], |r| r.get(0))
        .unwrap_or_default();
    let year: i32 = today[..4].parse().unwrap_or(2026);

    struct Deadline {
        date: String,
        label: String,
        start: String,
        end: String,
    }

    let deadlines = vec![
        Deadline { date: format!("{}-04-25", year), label: format!("{}년 1기 예정", year), start: format!("{}-01-01", year), end: format!("{}-03-31", year) },
        Deadline { date: format!("{}-07-25", year), label: format!("{}년 1기 확정", year), start: format!("{}-01-01", year), end: format!("{}-06-30", year) },
        Deadline { date: format!("{}-10-25", year), label: format!("{}년 2기 예정", year), start: format!("{}-07-01", year), end: format!("{}-09-30", year) },
        Deadline { date: format!("{}-01-25", year + 1), label: format!("{}년 2기 확정", year), start: format!("{}-07-01", year), end: format!("{}-12-31", year) },
    ];

    let chosen = deadlines
        .into_iter()
        .find(|d| d.date >= today)
        .unwrap_or(Deadline {
            date: format!("{}-04-25", year + 1),
            label: format!("{}년 1기 예정", year + 1),
            start: format!("{}-01-01", year + 1),
            end: format!("{}-03-31", year + 1),
        });

    let days_left = days_between(&chosen.date, &today);

    let vat: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(tr.vat_amount),0) FROM tax_records tr JOIN transactions t ON t.id=tr.transaction_id WHERE t.date BETWEEN ?1 AND ?2",
            rusqlite::params![chosen.start, chosen.end],
            |r| r.get(0),
        )
        .unwrap_or(0.0);

    let urgency = if days_left <= 7 { "🔴" } else if days_left <= 30 { "🟡" } else { "🟢" };

    format!(
        "🧾 *부가세 신고 현황*\n\n{} {}\n신고 기한까지: *D\\-{}*\n예상 납부세액: {}",
        urgency,
        chosen.label,
        days_left,
        krw(vat)
    )
}

pub async fn run_bot(token: String, db_path: PathBuf) {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(35))
        .build()
        .unwrap_or_default();
    let mut offset = 0i64;

    eprintln!("[mallbook-bot] 시작");

    loop {
        let url = format!(
            "https://api.telegram.org/bot{}/getUpdates?offset={}&timeout=25",
            token, offset
        );

        match client.get(&url).send().await {
            Ok(resp) => match resp.json::<TgResponse<Vec<Update>>>().await {
                Ok(data) => {
                    for upd in data.result.unwrap_or_default() {
                        offset = upd.update_id + 1;
                        let Some(msg) = upd.message else { continue };
                        let Some(text) = msg.text else { continue };
                        let chat_id = msg.chat.id;
                        let cmd = text.split_whitespace().next().unwrap_or("");

                        // chat_id 화이트리스트 체크
                        match read_allowed_chat_id(&db_path) {
                            Some(id) if id != chat_id => {
                                eprintln!("[mallbook-bot] 허가되지 않은 chat_id: {}", chat_id);
                                continue;
                            }
                            None if cmd == "/start" => {
                                write_allowed_chat_id(&db_path, chat_id);
                                send_msg(&client, &token, chat_id,
                                    "✅ *MallBook 봇 페어링 완료\\!*\n이 채팅에서만 명령어를 사용할 수 있습니다\\.\n\n"
                                ).await;
                            }
                            None => {
                                eprintln!("[mallbook-bot] 페어링 미완료, 거부: chat_id={}", chat_id);
                                continue;
                            }
                            _ => {}
                        }

                        let response = match Connection::open(&db_path) {
                            Ok(db) => match cmd {
                                "/start" | "/help" => HELP.to_string(),
                                "/today" => q_today(&db),
                                "/month" => q_month(&db),
                                "/unpaid" => q_unpaid(&db),
                                "/due" => q_due(&db),
                                "/stock" => q_stock(&db),
                                "/tax" => q_tax(&db),
                                _ if cmd.starts_with('/') => {
                                    format!("알 수 없는 명령어\n\n{}", HELP)
                                }
                                _ => continue,
                            },
                            Err(e) => format!("❌ DB 연결 실패: {}", e),
                        };

                        send_msg(&client, &token, chat_id, &response).await;
                    }
                }
                Err(e) => {
                    eprintln!("[mallbook-bot] JSON 오류: {}", e);
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            },
            Err(e) => {
                eprintln!("[mallbook-bot] 네트워크 오류: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}
