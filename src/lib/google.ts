import { invoke } from "@tauri-apps/api/core";

export interface GoogleTokens {
  access_token: string;
  expires_at_ms: number;
  email: string;
}

export interface SheetTarget {
  sheet_id: string;
  tab: string;
}

export interface TransactionRow {
  date: string;
  type: string; // 한글 라벨 ("구매" / "판매" / "지출")
  counterparty: string;
  category: string;
  items_summary: string;
  commission_amount: number;
  amount: number;
  payment_status: "paid" | "pending";
  memo: string;
}



export function hasGoogleClientId(): boolean {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === "string" && id.trim() !== "";
}

export async function connectGoogle(): Promise<GoogleTokens> {
  const tokens = await invoke<GoogleTokens>("google_oauth_start");
  cachedTokens = tokens;
  return tokens;
}

export async function disconnectGoogle(): Promise<void> {
  await invoke("google_disconnect");
  cachedTokens = null;
}

export async function isGoogleConnected(): Promise<boolean> {
  return await invoke<boolean>("google_is_connected");
}

let cachedTokens: GoogleTokens | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  // 60 second safety margin
  if (cachedTokens && cachedTokens.expires_at_ms - 60_000 > now) {
    return cachedTokens.access_token;
  }
  const tokens = await invoke<GoogleTokens>("google_get_access_token");
  cachedTokens = tokens;
  return tokens.access_token;
}

/**
 * 시트 URL 또는 raw ID를 받아 정제된 ID를 반환.
 * https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0
 */
export function parseSheetId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

const HEADER_ROW = ["날짜", "유형", "거래처", "분류", "상품내역", "수수료", "금액", "결제상태", "메모"];

export async function ensureSheetHeader(target: SheetTarget): Promise<void> {
  const token = await getAccessToken();
  const tab = target.tab || "Transactions";
  const range = `${encodeURIComponent(tab)}!A1:I1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    target.sheet_id,
  )}/values/${range}`;

  // 첫 행 읽기
  const getResp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (getResp.ok) {
    const data = await getResp.json();
    if (data.values && data.values.length > 0) return; // 이미 데이터 있음
  }

  // 빈 시트면 헤더 추가
  const putResp = await fetch(`${url}?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [HEADER_ROW] }),
  });
  if (!putResp.ok) {
    const text = await putResp.text().catch(() => "");
    throw new Error(`헤더 추가 실패 (${putResp.status}): ${text}`);
  }
}

export async function clearSheet(target: SheetTarget): Promise<void> {
  const token = await getAccessToken();
  const tab = target.tab || "Transactions";
  const range = `${encodeURIComponent(tab)}!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    target.sheet_id,
  )}/values/${range}:clear`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`시트 비우기 실패 (${resp.status}): ${text}`);
  }
}

export async function readSheetRows(
  target: SheetTarget,
): Promise<string[][]> {
  const token = await getAccessToken();
  const tab = target.tab || "Transactions";
  const range = `${encodeURIComponent(tab)}!A:I`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    target.sheet_id,
  )}/values/${range}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`시트 읽기 실패 (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  const rows: string[][] = data.values ?? [];
  // 첫 행이 헤더면 제외
  if (rows.length > 0 && rows[0][0] === "날짜") {
    return rows.slice(1);
  }
  return rows;
}

export async function appendTransactionRow(
  target: SheetTarget,
  row: TransactionRow,
): Promise<void> {
  const token = await getAccessToken();
  const tab = target.tab || "Transactions";
  const range = `${encodeURIComponent(tab)}!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    target.sheet_id,
  )}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const body = {
    values: [
      [
        row.date,
        row.type,
        row.counterparty,
        row.category,
        row.items_summary,
        row.commission_amount,
        row.amount,
        row.payment_status === "paid" ? "완료" : "대납",
        row.memo,
      ],
    ],
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Sheets append failed (${resp.status}): ${text}`);
  }
}

/**
 * 스프레드시트의 모든 탭 이름 반환
 */
export async function getSheetTabs(sheetId: string): Promise<string[]> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId,
  )}?fields=sheets.properties.title`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`탭 목록 조회 실패 (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  return ((data.sheets ?? []) as { properties: { title: string } }[]).map(
    (s) => s.properties.title,
  );
}

/**
 * 특정 탭을 초기화하고 헤더+데이터를 한번에 씀
 */
export async function writeTabRows(
  sheetId: string,
  tab: string,
  headerRow: string[],
  dataRows: string[][],
): Promise<void> {
  await clearSheet({ sheet_id: sheetId, tab });
  const token = await getAccessToken();
  const range = `${encodeURIComponent(tab)}!A1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId,
  )}/values/${range}?valueInputOption=USER_ENTERED`;
  const values = [headerRow, ...dataRows];
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`탭 쓰기 실패 (${resp.status}): ${text}`);
  }
}
