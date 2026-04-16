import { useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { getCurrentUser, updateUser, resetSheetSync, syncAllTransactions, restoreFromSheet, exportAllData, importAllData, syncStockToSheet, syncSummaryToSheet } from "@/lib/db";
import type { TaxType, User } from "@/types";
import {
  connectGoogle,
  disconnectGoogle,
  hasGoogleClientId,
  isGoogleConnected,
  parseSheetId,
} from "@/lib/google";

export function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [taxType, setTaxType] = useState<TaxType>("일반과세자");
  const [salesGoal, setSalesGoal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Google 연동 상태
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string>("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const [sheetInput, setSheetInput] = useState("");
  const clientIdAvailable = hasGoogleClientId();

  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        if (u) {
          setUser(u);
          setName(u.name);
          setBusinessNumber(u.business_number ?? "");
          setTaxType(u.tax_type);
          setSheetInput(u.google_sheet_id ?? "");
          setGoogleEmail(u.google_email ?? "");
          setSalesGoal(u.monthly_sales_goal ?? 0);
        }
        try {
          setGoogleConnected(await isGoogleConnected());
        } catch {
          setGoogleConnected(false);
        }
        try {
          const token = await invoke<string>("bot_get_token");
          if (token) {
            setBotToken(token);
            setBotActive(true);
          }
        } catch {
          // 봇 토큰 로드 실패는 무시
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "사용자 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setError(null);
    setSaving(true);
    try {
      await updateUser({
        name: name.trim() || "사장님",
        business_number: businessNumber.trim() || null,
        tax_type: taxType,
        monthly_sales_goal: Math.max(0, Math.trunc(Number(salesGoal) || 0)),
      });
      const u = await getCurrentUser();
      if (u) setUser(u);
      setStatus("저장되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function onConnectGoogle() {
    setGoogleError(null);
    setGoogleStatus(null);
    setGoogleBusy(true);
    try {
      const tokens = await connectGoogle();
      setGoogleConnected(true);
      setGoogleEmail(tokens.email);
      if (tokens.email) {
        await updateUser({ google_email: tokens.email });
        const u = await getCurrentUser();
        if (u) setUser(u);
      }
      setGoogleStatus("구글 계정에 연결되었습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setGoogleError(`구글 연결에 실패했습니다: ${msg}`);
    } finally {
      setGoogleBusy(false);
    }
  }

  async function onDisconnectGoogle() {
    setGoogleError(null);
    setGoogleStatus(null);
    setGoogleBusy(true);
    try {
      await disconnectGoogle();
      setGoogleConnected(false);
      setGoogleEmail("");
      await updateUser({ google_email: null });
      const u = await getCurrentUser();
      if (u) setUser(u);
      setGoogleStatus("연결이 해제되었습니다.");
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "연결 해제에 실패했습니다.");
    } finally {
      setGoogleBusy(false);
    }
  }

  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [syncAction, setSyncAction] = useState<"stock" | "summary" | "restore" | "all" | null>(null);

  const onSyncStock = async () => {
    setGoogleBusy(true);
    setSyncAction("stock");
    setSyncProgress("재고 동기화 중…");
    try {
      await syncStockToSheet();
      setSyncProgress("재고 탭 동기화 완료");
    } catch (e) {
      setSyncProgress(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setGoogleBusy(false);
      setSyncAction(null);
    }
  };

  const onSyncSummary = async () => {
    setGoogleBusy(true);
    setSyncAction("summary");
    setSyncProgress("요약 동기화 중…");
    try {
      await syncSummaryToSheet();
      setSyncProgress("거래처 요약 탭 동기화 완료");
    } catch (e) {
      setSyncProgress(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setGoogleBusy(false);
      setSyncAction(null);
    }
  };

  // 백업/복원
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // 드라이브 백업
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveStatus, setDriveStatus] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  async function onDriveBackup() {
    setDriveBusy(true);
    setDriveStatus(null);
    setDriveError(null);
    try {
      const msg = await invoke<string>("drive_backup_db");
      setDriveStatus(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      setDriveError(`백업 실패: ${msg}`);
    } finally {
      setDriveBusy(false);
    }
  }

  async function onDriveRestore() {
    setDriveBusy(true);
    setDriveStatus(null);
    setDriveError(null);
    try {
      const msg = await invoke<string>("drive_restore_db");
      setDriveStatus(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      setDriveError(`복원 실패: ${msg}`);
    } finally {
      setDriveBusy(false);
    }
  }

  // 텔레그램 봇
  const [botToken, setBotToken] = useState("");
  const [botSaving, setBotSaving] = useState(false);
  const [botStatus, setBotStatus] = useState<string | null>(null);
  const [botError, setBotError] = useState<string | null>(null);
  const [botActive, setBotActive] = useState(false);
  const [botEditing, setBotEditing] = useState(false);

  async function onSaveSheet(e: FormEvent) {
    e.preventDefault();
    setGoogleError(null);
    setGoogleStatus(null);
    setGoogleBusy(true);
    try {
      const id = parseSheetId(sheetInput);
      const prevId = user?.google_sheet_id;
      await updateUser({
        google_sheet_id: id || null,
      });
      // 시트가 변경되면 동기화 상태 리셋
      if (id && prevId !== id) {
        await resetSheetSync();
      }
      const u = await getCurrentUser();
      if (u) {
        setUser(u);
        setSheetInput(u.google_sheet_id ?? "");
      }
      const msg = id && prevId !== id
        ? "시트 설정이 저장되었습니다. 동기화 상태가 초기화되었습니다."
        : "시트 설정이 저장되었습니다.";
      setGoogleStatus(msg);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function onSyncAll() {
    setGoogleError(null);
    setGoogleStatus(null);
    setGoogleBusy(true);
    setSyncAction("all");
    setSyncProgress("준비 중…");
    try {
      await resetSheetSync();
      const result = await syncAllTransactions((done, total) => {
        setSyncProgress(`${done} / ${total} 동기화 중…`);
      });
      setSyncProgress(null);
      setGoogleStatus(
        `전체 동기화 완료: 성공 ${result.success}건` +
          (result.failed > 0 ? `, 실패 ${result.failed}건` : ""),
      );
    } catch (err) {
      setSyncProgress(null);
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setGoogleError(`동기화 실패: ${msg}`);
    } finally {
      setGoogleBusy(false);
      setSyncAction(null);
    }
  }

  async function onRestoreFromSheet() {
    setGoogleError(null);
    setGoogleStatus(null);
    setGoogleBusy(true);
    setSyncAction("restore");
    setSyncProgress("시트에서 읽는 중…");
    try {
      const result = await restoreFromSheet((done, total) => {
        setSyncProgress(`${done} / ${total} 복원 중…`);
      });
      setSyncProgress(null);
      setGoogleStatus(
        `복원 완료: ${result.restored}건 복원` +
          (result.skipped > 0 ? `, ${result.skipped}건 건너뜀 (중복 또는 오류)` : ""),
      );
    } catch (err) {
      setSyncProgress(null);
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setGoogleError(`복원 실패: ${msg}`);
    } finally {
      setGoogleBusy(false);
      setSyncAction(null);
    }
  }

  async function onSaveBotToken(e: FormEvent) {
    e.preventDefault();
    setBotError(null);
    setBotStatus(null);
    setBotSaving(true);
    try {
      await invoke("bot_set_token", { token: botToken.trim() });
      setBotActive(!!botToken.trim());
      setBotEditing(false);
      setBotStatus(botToken.trim() ? "봇이 시작되었습니다." : "봇 연결이 해제되었습니다.");
    } catch (err) {
      setBotError(err instanceof Error ? err.message : "봇 설정 저장에 실패했습니다.");
    } finally {
      setBotSaving(false);
    }
  }

  async function onClearBotToken() {
    setBotError(null);
    setBotStatus(null);
    setBotSaving(true);
    try {
      await invoke("bot_set_token", { token: "" });
      setBotToken("");
      setBotActive(false);
      setBotStatus("봇 연결이 해제되었습니다.");
    } catch (err) {
      setBotError(err instanceof Error ? err.message : "봇 연결 해제에 실패했습니다.");
    } finally {
      setBotSaving(false);
    }
  }

  async function onExportJson() {
    setBackupBusy(true);
    setBackupStatus(null);
    setBackupError(null);
    try {
      const json = await exportAllData();
      const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `mallbook_backup_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupStatus("백업 파일이 다운로드되었습니다.");
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : "백업 실패");
    } finally {
      setBackupBusy(false);
    }
  }

  async function onImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBackupBusy(true);
    setBackupStatus(null);
    setBackupError(null);
    try {
      const text = await file.text();
      const result = await importAllData(text);
      setBackupStatus(
        `복원 완료: ${result.imported}건 가져옴` +
          (result.skipped > 0 ? `, ${result.skipped}건 건너뜀 (중복)` : "") +
          (result.errors.length > 0 ? ` — 오류 ${result.errors.length}건` : ""),
      );
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : "복원 실패 — JSON 형식을 확인하세요.");
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="text-sm text-neutral-500">사업자 정보와 과세 유형을 관리합니다.</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>사용자 정보</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-neutral-500">불러오는 중…</div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
              <Field label="이름" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="사업자등록번호" hint="예: 123-45-67890">
                <Input
                  value={businessNumber}
                  onChange={(e) => setBusinessNumber(e.target.value)}
                  placeholder="123-45-67890"
                />
              </Field>
              <Field label="과세 유형" required>
                <Select
                  value={taxType}
                  onChange={(e) => setTaxType(e.target.value as TaxType)}
                >
                  <option value="일반과세자">일반과세자</option>
                  <option value="간이과세자">간이과세자</option>
                </Select>
              </Field>
              <Field label="이번 달 목표 매출 (원)" hint="0 입력 시 대시보드 목표 바 숨김">
                <Input
                  type="number"
                  min={0}
                  step={10000}
                  value={salesGoal === 0 ? "" : salesGoal}
                  onChange={(e) => setSalesGoal(Number(e.target.value || 0))}
                  placeholder="예: 5000000"
                />
              </Field>
              <div className="text-xs text-neutral-500">
                계정 ID: {user?.id ?? "—"} · 생성일: {user?.created_at?.slice(0, 10) ?? "—"}
              </div>
              {status && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                  {status}
                </div>
              )}
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? "저장 중…" : "저장"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>구글시트 연동</CardTitle>
        </CardHeader>
        <CardContent>
          {!clientIdAvailable ? (
            <div className="space-y-2 text-sm">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                구글 클라이언트 ID가 설정되지 않았습니다.
              </div>
              <p className="text-xs text-neutral-500">
                <code>.env</code> 파일에{" "}
                <code className="rounded bg-neutral-100 px-1">VITE_GOOGLE_CLIENT_ID</code>{" "}
                값을 추가한 뒤 앱을 재시작하세요. Google Cloud Console에서 OAuth 2.0 클라이언트
                ID(Desktop type)를 발급받아 사용합니다.
              </p>
            </div>
          ) : (
            <div className="max-w-2xl space-y-4">
              {googleError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {googleError}
                </div>
              )}
              {googleStatus && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                  {googleStatus}
                </div>
              )}

              {/* 계정 연결 상태 */}
              <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <div>
                  {googleConnected ? (
                    <>
                      <div className="text-xs text-emerald-600 mb-0.5">● 연결됨</div>
                      <div className="font-medium text-neutral-800">
                        {googleEmail || "(이메일 정보 없음)"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-neutral-500 mb-0.5">연결 안 됨</div>
                      <div className="text-xs text-neutral-500">
                        연결하면 거래 저장 시 자동으로 구글시트에 기록됩니다.
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={onConnectGoogle}
                    disabled={googleBusy || googleConnected}
                  >
                    {googleBusy && !googleConnected ? "연결 중…" : "구글 계정 연결"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onDisconnectGoogle}
                    disabled={googleBusy || !googleConnected}
                  >
                    연결 해제
                  </Button>
                </div>
              </div>

              {/* 시트 설정 — 연결 시에만 활성화 */}
              <form onSubmit={onSaveSheet} className="space-y-3">
                <Field label="Sheet ID 또는 URL" required>
                  <Input
                    value={sheetInput}
                    onChange={(e) => setSheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/... 또는 ID"
                    disabled={!googleConnected}
                  />
                </Field>
                <div className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 space-y-1">
                  <p><span className="font-medium text-neutral-700">시트에서 복원</span> — 구글시트에 저장된 데이터를 앱으로 불러옵니다. 기기를 바꾸거나 앱을 재설치했을 때 사용하세요.</p>
                  <p><span className="font-medium text-neutral-700">전체 동기화</span> — 앱의 모든 거래 내역을 구글시트에 덮어씁니다. 시트 내용이 달라졌을 때 앱 기준으로 다시 맞출 때 사용하세요.</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={googleBusy || !googleConnected || !user?.google_sheet_id}
                    onClick={onSyncStock}
                  >
                    {syncAction === "stock" ? (syncProgress ?? "처리 중…") : "재고 탭 동기화"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={googleBusy || !googleConnected || !user?.google_sheet_id}
                    onClick={onSyncSummary}
                  >
                    {syncAction === "summary" ? (syncProgress ?? "처리 중…") : "거래처 요약 동기화"}
                  </Button>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={googleBusy || !googleConnected || !user?.google_sheet_id}
                    onClick={onRestoreFromSheet}
                  >
                    {syncAction === "restore" ? (syncProgress ?? "처리 중…") : "시트에서 복원"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={googleBusy || !googleConnected || !user?.google_sheet_id}
                    onClick={onSyncAll}
                  >
                    {syncAction === "all" ? (syncProgress ?? "처리 중…") : "전체 동기화"}
                  </Button>
                  <Button type="submit" disabled={googleBusy || !googleConnected}>
                    {googleBusy && !syncAction ? "저장 중…" : "시트 설정 저장"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>텔레그램 봇 연동</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-2xl space-y-4">
            <p className="text-sm text-neutral-600">
              봇 토큰을 저장하면 앱이 실행 중일 때 텔레그램에서 매출·미수금·재고를 조회할 수 있습니다.
            </p>
            <div className="rounded-md border border-neutral-100 bg-neutral-50 p-3 text-xs text-neutral-600 space-y-1.5">
              <p className="font-medium text-neutral-700 mb-2">사용 가능한 명령어</p>
              <p><code className="rounded bg-neutral-200 px-1">/today</code> — 오늘 매출·지출·순이익 요약</p>
              <p><code className="rounded bg-neutral-200 px-1">/month</code> — 이번달 매출·지출·순이익 현황</p>
              <p><code className="rounded bg-neutral-200 px-1">/unpaid</code> — 판매 미수금 (외상 받을 돈) 목록</p>
              <p><code className="rounded bg-neutral-200 px-1">/due</code> — 오늘 줄 돈 (매입 외상) 목록</p>
              <p><code className="rounded bg-neutral-200 px-1">/stock</code> — 재고 5개 이하 상품 목록</p>
              <p><code className="rounded bg-neutral-200 px-1">/tax</code> — 부가세 신고 기한 및 예상 납부세액</p>
            </div>

            {botError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {botError}
              </div>
            )}
            {botStatus && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                {botStatus}
              </div>
            )}

            {/* 저장된 상태 — 읽기 전용 */}
            {botActive && !botEditing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                  <div>
                    <div className="text-xs text-emerald-600 mb-0.5">봇 실행 중</div>
                    <span className="font-mono text-neutral-700 tracking-widest text-xs">
                      {botToken.slice(0, 10)}●●●●●●●●●●●●●●●
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => { setBotEditing(true); setBotStatus(null); }}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={onClearBotToken}
                      disabled={botSaving}
                    >
                      연결 해제
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* 편집 상태 */
              <form onSubmit={onSaveBotToken} className="space-y-3">
                <Field label="봇 토큰" hint="BotFather에서 발급: @BotFather → /newbot">
                  <Input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="123456789:ABC..."
                    autoFocus={botEditing}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  {botEditing && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => { setBotEditing(false); setBotStatus(null); setBotError(null); }}
                      disabled={botSaving}
                    >
                      취소
                    </Button>
                  )}
                  <Button type="submit" disabled={botSaving || !botToken.trim()}>
                    {botSaving ? "저장 중…" : "저장 및 시작"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>데이터 백업 / 복원</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-2xl space-y-4">
            <p className="text-sm text-neutral-600">
              모든 거래처·상품·거래 내역을 JSON 파일로 내보내거나, 이전에 만든 백업 파일을 복원합니다.
            </p>
            <div className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 space-y-1">
              <p><span className="font-medium text-neutral-700">백업 내보내기</span> — 현재 DB 전체를 JSON 파일로 저장합니다. 기기 이전이나 앱 재설치 전에 사용하세요.</p>
              <p><span className="font-medium text-neutral-700">백업에서 복원</span> — 이전에 저장한 JSON 파일을 선택하면 새 항목만 추가됩니다. 기존 데이터는 삭제되지 않습니다.</p>
            </div>
            {backupError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {backupError}
              </div>
            )}
            {backupStatus && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                {backupStatus}
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={onExportJson} disabled={backupBusy} variant="secondary">
                {backupBusy ? "처리 중…" : "백업 내보내기"}
              </Button>
              <label className={`inline-flex cursor-pointer ${backupBusy ? "opacity-50 pointer-events-none" : ""}`}>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={onImportJson}
                  disabled={backupBusy}
                />
                <span className="inline-flex items-center justify-center rounded-md bg-neutral-100 px-4 py-0 h-10 text-sm font-medium text-neutral-900 hover:bg-neutral-200 transition-colors cursor-pointer">
                  백업에서 복원
                </span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>구글 드라이브 DB 백업</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-2xl space-y-4">
            <p className="text-sm text-neutral-600">
              SQLite DB 파일 전체를 구글 드라이브에 백업하거나 복원합니다. 구글 계정이 연결되어 있어야 합니다.
            </p>
            <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              드라이브 백업 기능을 처음 사용하려면 <strong>구글 계정을 재연결</strong>해야 합니다 (Drive 권한 추가).
            </div>
            <div className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 space-y-1">
              <p><span className="font-medium text-neutral-700">드라이브에 백업</span> — 현재 DB를 드라이브의 <code>mallbook_backup.db</code>로 저장합니다. 기존 파일이 있으면 덮어씁니다.</p>
              <p><span className="font-medium text-neutral-700">드라이브에서 복원</span> — 드라이브의 백업 파일로 DB를 교체합니다. 복원 후 앱을 재시작하세요.</p>
            </div>
            {driveError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {driveError}
              </div>
            )}
            {driveStatus && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                {driveStatus}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                onClick={onDriveBackup}
                disabled={driveBusy || !googleConnected}
                variant="secondary"
              >
                {driveBusy ? "처리 중…" : "드라이브에 백업"}
              </Button>
              <Button
                onClick={() => setConfirmRestore(true)}
                disabled={driveBusy || !googleConnected}
                variant="secondary"
              >
                드라이브에서 복원
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={confirmRestore}
        title="드라이브에서 복원"
        onClose={() => setConfirmRestore(false)}
        className="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            드라이브 백업에서 DB를 복원하면 현재 데이터가 교체됩니다. 계속할까요?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmRestore(false)}
              disabled={driveBusy}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={driveBusy}
              onClick={async () => {
                setConfirmRestore(false);
                await onDriveRestore();
              }}
            >
              {driveBusy ? "처리 중…" : "복원"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
