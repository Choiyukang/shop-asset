// MallBook 텔레그램 봇
// 설정: .env 파일에 BOT_TOKEN=xxx 설정 후 실행
//
// 명령어:
//   /start    — 도움말
//   /today    — 오늘 매출/지출 요약
//   /month    — 이번달 매출/지출/순이익
//   /unpaid   — 미수금 현황 (판매 외상)
//   /due      — 오늘 줄 돈 (매입 외상)
//   /stock    — 재고 부족 (5개 이하)
//   /tax      — 부가세 신고 현황

import Database from "better-sqlite3";
import TelegramBot from "node-telegram-bot-api";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── 환경변수 로드 (.env 파일) ──────────────────────────────────────────────
const envPath = new URL(".env", import.meta.url).pathname;
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN이 설정되지 않았습니다. .env 파일에 BOT_TOKEN=xxx 를 추가하세요.");
  process.exit(1);
}

// ── SQLite DB 경로 ─────────────────────────────────────────────────────────
// MallBook (Tauri) DB 위치: ~/Library/Application Support/com.yukangchoi.shop-asset/mallbook.db
const DB_PATH =
  process.env.DB_PATH ??
  join(homedir(), "Library", "Application Support", "com.yukangchoi.shop-asset", "mallbook.db");

if (!existsSync(DB_PATH)) {
  console.error(`❌ DB를 찾을 수 없습니다: ${DB_PATH}`);
  console.error("   MallBook 앱을 한 번 실행해서 DB를 생성하거나, DB_PATH 환경변수를 설정하세요.");
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
console.log(`✅ DB 연결: ${DB_PATH}`);

// ── 숫자 포맷 ────────────────────────────────────────────────────────────
function krw(n) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(n ?? 0);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── 쿼리 함수들 ───────────────────────────────────────────────────────────
function getTodaySummary() {
  const date = today();
  const rows = db
    .prepare(
      `SELECT type, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM transactions WHERE date = ? GROUP BY type`,
    )
    .all(date);
  let sales = 0, expense = 0, count = 0;
  for (const r of rows) {
    count += r.cnt;
    if (r.type === "sale") sales = r.total;
    else if (r.type === "purchase" || r.type === "expense") expense += r.total;
  }
  return { date, sales, expense, netIncome: sales - expense, count };
}

function getMonthSummary() {
  const prefix = thisMonth();
  const rows = db
    .prepare(
      `SELECT type, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM transactions WHERE substr(date,1,7) = ? GROUP BY type`,
    )
    .all(prefix);
  let sales = 0, expense = 0, count = 0;
  for (const r of rows) {
    count += r.cnt;
    if (r.type === "sale") sales = r.total;
    else if (r.type === "purchase" || r.type === "expense") expense += r.total;
  }
  return { month: prefix, sales, expense, netIncome: sales - expense, count };
}

function getUnpaidReceivables() {
  return db
    .prepare(
      `SELECT COALESCE(c.name, '(거래처 없음)') AS name,
              COALESCE(SUM(t.amount), 0) AS total,
              MIN(t.date) AS earliest
         FROM transactions t
         LEFT JOIN counterparties c ON c.id = t.counterparty_id
        WHERE t.type = 'sale' AND t.payment_status = 'pending'
        GROUP BY t.counterparty_id
        ORDER BY earliest ASC`,
    )
    .all();
}

function getTodayDue() {
  const date = today();
  return db
    .prepare(
      `SELECT COALESCE(c.name, '(거래처 없음)') AS name,
              COALESCE(SUM(t.amount), 0) AS total
         FROM transactions t
         LEFT JOIN counterparties c ON c.id = t.counterparty_id
        WHERE t.date = ? AND t.type = 'purchase' AND t.payment_status = 'pending'
        GROUP BY t.counterparty_id`,
    )
    .all(date);
}

function getLowStock(threshold = 5) {
  return db
    .prepare(
      `SELECT name, color, stock FROM products WHERE stock <= ? ORDER BY stock ASC`,
    )
    .all(threshold);
}

function getTaxStatus() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  // 다음 신고 기한 계산
  const deadlines = [
    { date: new Date(y, 3, 25), label: `${y}년 1기 예정`, start: `${y}-01-01`, end: `${y}-03-31` },
    { date: new Date(y, 6, 25), label: `${y}년 1기 확정`, start: `${y}-01-01`, end: `${y}-06-30` },
    { date: new Date(y, 9, 25), label: `${y}년 2기 예정`, start: `${y}-07-01`, end: `${y}-09-30` },
    { date: new Date(y + 1, 0, 25), label: `${y}년 2기 확정`, start: `${y}-07-01`, end: `${y}-12-31` },
  ];
  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  const chosen = deadlines.find((d) => d.date >= todayDate) ?? deadlines[3];
  const daysLeft = Math.ceil((chosen.date - todayDate) / 86_400_000);

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(tr.vat_amount), 0) AS total_vat
         FROM tax_records tr
         JOIN transactions t ON t.id = tr.transaction_id
        WHERE t.date BETWEEN ? AND ?`,
    )
    .get(chosen.start, chosen.end);

  return { label: chosen.label, daysLeft, estimatedVat: row?.total_vat ?? 0 };
}

// ── 봇 설정 ──────────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("🤖 MallBook 봇 시작 (Ctrl+C로 종료)");

const HELP = `📦 *MallBook 봇 명령어*

/today — 오늘 매출·지출 요약
/month — 이번달 현황
/unpaid — 미수금 (판매 외상)
/due — 오늘 줄 돈 (매입 외상)
/stock — 재고 부족 알림
/tax — 부가세 신고 현황`;

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, HELP, { parse_mode: "Markdown" });
});

bot.onText(/\/today/, (msg) => {
  try {
    const s = getTodaySummary();
    const text =
      `📅 *${s.date} 오늘 요약*\n\n` +
      `💚 매출: ${krw(s.sales)}\n` +
      `🔴 지출: ${krw(s.expense)}\n` +
      `━━━━━━━━━━\n` +
      `💰 순이익: ${krw(s.netIncome)}\n` +
      `📋 거래 건수: ${s.count}건`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ 오류: ${e.message}`);
  }
});

bot.onText(/\/month/, (msg) => {
  try {
    const s = getMonthSummary();
    const text =
      `📊 *${s.month} 이번달 현황*\n\n` +
      `💚 매출: ${krw(s.sales)}\n` +
      `🔴 지출: ${krw(s.expense)}\n` +
      `━━━━━━━━━━\n` +
      `💰 순이익: ${krw(s.netIncome)}\n` +
      `📋 거래 건수: ${s.count}건`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ 오류: ${e.message}`);
  }
});

bot.onText(/\/unpaid/, (msg) => {
  try {
    const rows = getUnpaidReceivables();
    if (rows.length === 0) {
      bot.sendMessage(msg.chat.id, "✅ 미수금 없음");
      return;
    }
    const total = rows.reduce((s, r) => s + r.total, 0);
    const lines = rows.map((r) => {
      const days = Math.floor((Date.now() - new Date(r.earliest).getTime()) / 86_400_000);
      const badge = days >= 30 ? "🔴" : days >= 7 ? "🟡" : "⚪";
      return `${badge} ${r.name}: ${krw(r.total)} (${days}일 경과)`;
    });
    const text = `💸 *미수금 현황*\n\n${lines.join("\n")}\n\n합계: ${krw(total)}`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ 오류: ${e.message}`);
  }
});

bot.onText(/\/due/, (msg) => {
  try {
    const rows = getTodayDue();
    if (rows.length === 0) {
      bot.sendMessage(msg.chat.id, "✅ 오늘 줄 돈 없음");
      return;
    }
    const total = rows.reduce((s, r) => s + r.total, 0);
    const lines = rows.map((r) => `• ${r.name}: ${krw(r.total)}`);
    const text = `💴 *오늘 줄 돈*\n\n${lines.join("\n")}\n\n합계: ${krw(total)}`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ 오류: ${e.message}`);
  }
});

bot.onText(/\/stock/, (msg) => {
  try {
    const rows = getLowStock(5);
    if (rows.length === 0) {
      bot.sendMessage(msg.chat.id, "✅ 재고 부족 상품 없음");
      return;
    }
    const lines = rows.map((r) => {
      const badge = r.stock === 0 ? "🔴 품절" : `🟡 ${r.stock}개`;
      const color = r.color ? ` (${r.color})` : "";
      return `${badge} — ${r.name}${color}`;
    });
    const text = `📦 *재고 부족 알림* (5개 이하)\n\n${lines.join("\n")}`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ 오류: ${e.message}`);
  }
});

bot.onText(/\/tax/, (msg) => {
  try {
    const t = getTaxStatus();
    const urgency = t.daysLeft <= 7 ? "🔴" : t.daysLeft <= 30 ? "🟡" : "🟢";
    const text =
      `🧾 *부가세 신고 현황*\n\n` +
      `${urgency} ${t.label}\n` +
      `신고 기한까지: *D-${t.daysLeft}*\n` +
      `예상 납부세액: ${krw(t.estimatedVat)}`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ 오류: ${e.message}`);
  }
});

// 알 수 없는 명령어
bot.on("message", (msg) => {
  if (msg.text?.startsWith("/") && !msg.text.match(/^\/(start|today|month|unpaid|due|stock|tax)/)) {
    bot.sendMessage(msg.chat.id, `알 수 없는 명령어입니다.\n\n${HELP}`, { parse_mode: "Markdown" });
  }
});
