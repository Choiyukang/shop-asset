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

function clientId(): string {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!id || typeof id !== "string" || id.trim() === "") {
    throw new Error(
      "VITE_GOOGLE_CLIENT_ID가 설정되지 않았습니다. .env 파일을 확인하세요.",
    );
  }
  return id;
}

function clientSecret(): string {
  const secret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
  if (!secret || typeof secret !== "string" || secret.trim() === "") {
    throw new Error(
      "VITE_GOOGLE_CLIENT_SECRET이 설정되지 않았습니다. .env 파일을 확인하세요.",
    );
  }
  return secret;
}

export function hasGoogleClientId(): boolean {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === "string" && id.trim() !== "";
}

export async function connectGoogle(): Promise<GoogleTokens> {
  const tokens = await invoke<GoogleTokens>("google_oauth_start", {
    clientId: clientId(),
    clientSecret: clientSecret(),
  });
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
  const tokens = await invoke<GoogleTokens>("google_get_access_token", {
    clientId: clientId(),
    clientSecret: clientSecret(),
  });
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
        row.payment_status === "paid" ? "완료" : "외상",
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
