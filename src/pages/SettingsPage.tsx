import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, updateUser } from "@/lib/db";
import type { TaxType, User } from "@/types";

export function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [taxType, setTaxType] = useState<TaxType>("일반과세자");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        if (u) {
          setUser(u);
          setName(u.name);
          setBusinessNumber(u.business_number ?? "");
          setTaxType(u.tax_type);
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
    </div>
  );
}
