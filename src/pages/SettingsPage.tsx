import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, updateUser } from "@/lib/db";
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
  const [sheetTab, setSheetTab] = useState("Transactions");
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
          setSheetTab(u.google_sheet_tab ?? "Transactions");
          setGoogleEmail(u.google_email ?? "");
        }
        try {
          setGoogleConnected(await isGoogleConnected());
        } catch {
          setGoogleConnected(false);
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
      setGoogleError(err instanceof Error ? err.message : "구글 연결에 실패했습니다.");
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

  async function onSaveSheet(e: FormEvent) {
    e.preventDefault();
    setGoogleError(null);
    setGoogleStatus(null);
    setGoogleBusy(true);
    try {
      const id = parseSheetId(sheetInput);
      await updateUser({
        google_sheet_id: id || null,
        google_sheet_tab: sheetTab.trim() || "Transactions",
      });
      const u = await getCurrentUser();
      if (u) {
        setUser(u);
        setSheetInput(u.google_sheet_id ?? "");
        setSheetTab(u.google_sheet_tab ?? "Transactions");
      }
      setGoogleStatus("시트 설정이 저장되었습니다.");
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setGoogleBusy(false);
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
            <form onSubmit={onSubmit} className="max-w-md space-y-4">
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
            <div className="max-w-md space-y-4">
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

              {!googleConnected ? (
                <div className="space-y-2">
                  <p className="text-sm text-neutral-600">
                    구글 계정에 연결하면 거래 저장 시 자동으로 구글시트에 기록됩니다.
                  </p>
                  <Button onClick={onConnectGoogle} disabled={googleBusy}>
                    {googleBusy ? "연결 중…" : "구글 계정 연결"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
                    <div>
                      <div className="text-xs text-neutral-500">연결된 계정</div>
                      <div className="font-medium text-neutral-800">
                        {googleEmail || "(이메일 정보 없음)"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onDisconnectGoogle}
                      disabled={googleBusy}
                    >
                      연결 해제
                    </Button>
                  </div>

                  <form onSubmit={onSaveSheet} className="space-y-3">
                    <Field label="Sheet ID 또는 URL" required>
                      <Input
                        value={sheetInput}
                        onChange={(e) => setSheetInput(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/... 또는 ID"
                      />
                    </Field>
                    <Field label="탭 이름" required>
                      <Input
                        value={sheetTab}
                        onChange={(e) => setSheetTab(e.target.value)}
                        placeholder="Transactions"
                      />
                    </Field>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={googleBusy}>
                        {googleBusy ? "저장 중…" : "시트 설정 저장"}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
