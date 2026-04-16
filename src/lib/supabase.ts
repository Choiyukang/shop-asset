import { createClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 앱 전용 계정 UID — RLS 정책과 일치해야 함
const APP_USER_UID = "02cef440-91d4-42d5-95f5-4bd9d1730bae";

// 앱 시작 시 호출 — 앱 전용 계정으로 로그인 (이메일/비번은 Rust 컴파일 타임 상수)
export async function ensureAuth(): Promise<void> {
  const { data } = await supabase.auth.getSession();

  // 이미 올바른 앱 계정으로 로그인된 경우 스킵
  if (data.session?.user?.id === APP_USER_UID) return;

  // 구 익명 세션 등 다른 계정이 남아있으면 로그아웃
  if (data.session) {
    await supabase.auth.signOut();
  }

  const result = await invoke<{ access_token: string; refresh_token: string }>(
    "supabase_sign_in",
    { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY },
  );
  await supabase.auth.setSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  });
}
