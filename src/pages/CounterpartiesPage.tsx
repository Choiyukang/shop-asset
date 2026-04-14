import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { useCounterpartyStore } from "@/stores/useCounterpartyStore";
import type { CounterpartyInput, CounterpartyType } from "@/types";

const typeLabel: Record<CounterpartyType, string> = {
  supplier: "공급업체",
  customer: "고객",
  personal: "개인",
};

export function CounterpartiesPage() {
  const { counterparties, load, add, loading, error } = useCounterpartyStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CounterpartyInput>({
    name: "",
    type: "supplier",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("이름을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      await add({
        name: form.name.trim(),
        type: form.type,
        phone: form.phone?.trim() || null,
      });
      setOpen(false);
      setForm({ name: "", type: "supplier", phone: "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "거래처 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">거래처</h1>
          <p className="text-sm text-neutral-500">공급업체 · 고객 · 개인을 등록해 거래에 연결합니다.</p>
        </div>
        <Button onClick={() => setOpen(true)}>거래처 추가</Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">타입</th>
              <th className="px-4 py-3 font-medium">연락처</th>
              <th className="px-4 py-3 font-medium">등록일</th>
            </tr>
          </thead>
          <tbody>
            {loading && counterparties.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && counterparties.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  등록된 거래처가 없습니다.
                </td>
              </tr>
            )}
            {counterparties.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 last:border-b-0">
                <td className="px-4 py-3 font-medium text-neutral-900">{c.name}</td>
                <td className="px-4 py-3 text-neutral-700">{typeLabel[c.type]}</td>
                <td className="px-4 py-3 text-neutral-700">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-500">{c.created_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} title="거래처 추가" onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="이름" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예: 삼촌 / ㅇㅇ유통"
            />
          </Field>
          <Field label="타입" required>
            <Select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as CounterpartyType })
              }
            >
              <option value="supplier">공급업체</option>
              <option value="customer">고객</option>
              <option value="personal">개인</option>
            </Select>
          </Field>
          <Field label="연락처">
            <Input
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="010-1234-5678"
            />
          </Field>
          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {formError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "저장 중…" : "저장"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
