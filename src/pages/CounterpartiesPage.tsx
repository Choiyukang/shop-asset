import { Fragment, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { useCounterpartyStore } from "@/stores/useCounterpartyStore";
import type { Counterparty, CounterpartyInput, CounterpartyType, Transaction } from "@/types";
import { updateCounterparty, getCounterpartyPendingTransactions, settleTransaction } from "@/lib/db";
import { formatKRW } from "@/lib/utils";

const typeLabel: Record<CounterpartyType, string> = {
  supplier: "공급업체",
  customer: "고객",
  personal: "개인",
};

interface FormState extends CounterpartyInput {
  commission_rate: number;
}

const emptyForm: FormState = {
  name: "",
  type: "supplier",
  phone: "",
  commission_rate: 0,
};

function DebtPanel({ counterparty, onSettled }: { counterparty: Counterparty; onSettled: () => void }) {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<string | null>(null);

  useEffect(() => {
    getCounterpartyPendingTransactions(counterparty.id)
      .then(setTxns)
      .finally(() => setLoading(false));
  }, [counterparty.id]);

  async function onSettle(txn: Transaction) {
    setSettling(txn.id);
    try {
      await settleTransaction(txn.id);
      setTxns((prev) => prev.filter((t) => t.id !== txn.id));
      onSettled();
    } finally {
      setSettling(null);
    }
  }

  const total = txns.reduce((s, t) => s + t.amount, 0);

  if (loading) {
    return <div className="px-8 py-4 text-xs text-neutral-500">불러오는 중…</div>;
  }

  if (txns.length === 0) {
    return (
      <div className="px-8 py-4 text-xs text-neutral-500">
        미결제 외상이 없습니다.
      </div>
    );
  }

  return (
    <div className="bg-neutral-50 px-6 py-4 border-t border-neutral-100">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-600">
          미결제 외상 {txns.length}건
        </span>
        <span className="text-sm font-semibold text-orange-600">{formatKRW(total)}</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="pb-2 font-medium">날짜</th>
            <th className="pb-2 font-medium">유형</th>
            <th className="pb-2 text-right font-medium">금액</th>
            <th className="pb-2 font-medium">메모</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {txns.map((t) => (
            <tr key={t.id}>
              <td className="py-1.5 text-neutral-700">{t.date}</td>
              <td className="py-1.5 text-neutral-500">
                {t.type === "sale" ? "매출" : t.type === "purchase" ? "매입" : "지출"}
              </td>
              <td className="py-1.5 text-right font-medium text-neutral-900">{formatKRW(t.amount)}</td>
              <td className="py-1.5 text-neutral-500">{t.memo || "—"}</td>
              <td className="py-1.5 text-right">
                <button
                  type="button"
                  disabled={settling === t.id}
                  onClick={() => onSettle(t)}
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {settling === t.id ? "처리 중…" : "정산"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CounterpartiesPage() {
  const { counterparties, load, add, remove, loading, error } = useCounterpartyStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(c: Counterparty) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      type: c.type,
      phone: c.phone ?? "",
      commission_rate: c.commission_rate ?? 0,
    });
    setFormError(null);
    setOpen(true);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("이름을 입력해 주세요.");
      return;
    }
    const rate = Math.max(0, Math.min(100, Math.trunc(Number(form.commission_rate) || 0)));
    setSubmitting(true);
    try {
      if (editingId) {
        await updateCounterparty(editingId, {
          name: form.name.trim(),
          type: form.type,
          phone: form.phone?.trim() || null,
          commission_rate: rate,
        });
        await load();
      } else {
        await add({
          name: form.name.trim(),
          type: form.type,
          phone: form.phone?.trim() || null,
          commission_rate: rate,
        });
      }
      setOpen(false);
      setForm(emptyForm);
      setEditingId(null);
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
        <Button onClick={openCreate}>거래처 추가</Button>
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
              <th className="px-4 py-3 font-medium">수수료율</th>
              <th className="px-4 py-3 font-medium">등록일</th>
              <th className="px-4 py-3 font-medium">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading && counterparties.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && counterparties.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  등록된 거래처가 없습니다.
                </td>
              </tr>
            )}
            {counterparties.map((c) => (
              <Fragment key={c.id}>
                <tr
                  className="border-b border-neutral-100 last:border-b-0 cursor-pointer hover:bg-neutral-50"
                  onClick={() => toggleExpand(c.id)}
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    <span className="mr-1.5 text-neutral-400 text-xs">
                      {expandedId === c.id ? "▾" : "▸"}
                    </span>
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{typeLabel[c.type]}</td>
                  <td className="px-4 py-3 text-neutral-700">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-700">{c.commission_rate ?? 0}%</td>
                  <td className="px-4 py-3 text-neutral-500">{c.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-neutral-500" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
                        onClick={() => openEdit(c)}
                      >
                        편집
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(c.id);
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === c.id && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <DebtPanel counterparty={c} onSettled={load} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={confirmDeleteId !== null}
        title="거래처 삭제"
        onClose={() => setConfirmDeleteId(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            <span className="font-semibold">
              {counterparties.find((c) => c.id === confirmDeleteId)?.name}
            </span>{" "}
            거래처를 삭제합니다.
          </p>
          <p className="text-xs text-neutral-500">
            기존 거래내역에서 거래처명은 그대로 유지됩니다.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmDeleteId(null)}
              disabled={deleting}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={deleting}
              onClick={async () => {
                if (!confirmDeleteId) return;
                setDeleting(true);
                try {
                  await remove(confirmDeleteId);
                  setConfirmDeleteId(null);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "거래처 삭제에 실패했습니다.");
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "삭제 중…" : "삭제"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={open}
        title={editingId ? "거래처 편집" : "거래처 추가"}
        onClose={() => setOpen(false)}
      >
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
          <Field label="수수료율 (%)" hint="삼촌·중간 공급자에게 지급할 기본 수수료율 (0-100)">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.commission_rate === 0 ? "" : form.commission_rate}
              onChange={(e) =>
                setForm({ ...form, commission_rate: Number(e.target.value || 0) })
              }
              placeholder="예: 10"
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
