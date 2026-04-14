import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { formatKRW, todayISO } from "@/lib/utils";
import { useTransactionStore } from "@/stores/useTransactionStore";
import { useCounterpartyStore } from "@/stores/useCounterpartyStore";
import { useCategoryStore } from "@/stores/useCategoryStore";
import { getCurrentUser } from "@/lib/db";
import type {
  PaymentStatus,
  TaxType,
  TransactionInput,
  TransactionType,
} from "@/types";

const typeLabel: Record<TransactionType, string> = {
  purchase: "구매",
  sale: "판매",
  expense: "지출",
};

export function TransactionsPage() {
  const { transactions, load, add, loading, error } = useTransactionStore();
  const { counterparties, load: loadCp } = useCounterpartyStore();
  const { categories, load: loadCat } = useCategoryStore();

  const [open, setOpen] = useState(false);
  const [taxType, setTaxType] = useState<TaxType>("일반과세자");
  const [form, setForm] = useState<TransactionInput>({
    date: todayISO(),
    type: "purchase",
    counterparty_id: null,
    category_id: "",
    amount: 0,
    memo: "",
    payment_status: "paid",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    load();
    loadCp();
    loadCat();
    getCurrentUser().then((u) => {
      if (u) setTaxType(u.tax_type);
    });
  }, [load, loadCp, loadCat]);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const counterpartyMap = useMemo(
    () => new Map(counterparties.map((c) => [c.id, c])),
    [counterparties],
  );

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  );

  useEffect(() => {
    // Auto-pick first matching category when type changes or modal opens
    if (open && filteredCategories.length > 0) {
      setForm((f) => {
        const stillValid = filteredCategories.some((c) => c.id === f.category_id);
        return stillValid ? f : { ...f, category_id: filteredCategories[0]!.id };
      });
    }
  }, [open, filteredCategories]);

  function resetForm() {
    setForm({
      date: todayISO(),
      type: "purchase",
      counterparty_id: null,
      category_id: "",
      amount: 0,
      memo: "",
      payment_status: "paid",
    });
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.category_id) {
      setFormError("분류를 선택해 주세요.");
      return;
    }
    if (!Number.isFinite(form.amount) || form.amount <= 0) {
      setFormError("금액을 0원보다 크게 입력해 주세요.");
      return;
    }
    if (!form.date) {
      setFormError("날짜를 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      await add(form, taxType);
      setOpen(false);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "거래 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">거래 내역</h1>
          <p className="text-sm text-neutral-500">
            구매 · 판매 · 지출을 기록하고 부가세를 자동 계산합니다.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          신규 거래
        </Button>
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
              <th className="px-4 py-3 font-medium">날짜</th>
              <th className="px-4 py-3 font-medium">타입</th>
              <th className="px-4 py-3 font-medium">거래처</th>
              <th className="px-4 py-3 font-medium">분류</th>
              <th className="px-4 py-3 font-medium">금액</th>
              <th className="px-4 py-3 font-medium">지불</th>
              <th className="px-4 py-3 font-medium">메모</th>
            </tr>
          </thead>
          <tbody>
            {loading && transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  아직 등록된 거래가 없습니다. "신규 거래" 버튼으로 첫 거래를 추가하세요.
                </td>
              </tr>
            )}
            {transactions.map((t) => {
              const cat = categoryMap.get(t.category_id);
              const cp = t.counterparty_id ? counterpartyMap.get(t.counterparty_id) : null;
              return (
                <tr key={t.id} className="border-b border-neutral-100 last:border-b-0">
                  <td className="px-4 py-3 text-neutral-700">{t.date}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                      {typeLabel[t.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{cp?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-700">{cat?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {formatKRW(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {t.payment_status === "paid" ? "완료" : "외상"}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{t.memo ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={open} title="신규 거래" onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="날짜" required>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="타입" required>
              <Select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as TransactionType })
                }
              >
                <option value="purchase">구매</option>
                <option value="sale">판매</option>
                <option value="expense">지출</option>
              </Select>
            </Field>
          </div>
          <Field label="거래처">
            <Select
              value={form.counterparty_id ?? ""}
              onChange={(e) =>
                setForm({ ...form, counterparty_id: e.target.value || null })
              }
            >
              <option value="">(선택 안 함)</option>
              {counterparties.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="분류" required>
            <Select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="" disabled>
                분류를 선택하세요
              </option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="금액 (원, 부가세 포함)" required>
            <Input
              type="number"
              min={0}
              step={1}
              value={form.amount === 0 ? "" : form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: Number(e.target.value || 0) })
              }
              placeholder="예: 330000"
            />
          </Field>
          <Field label="지불 상태" required>
            <Select
              value={form.payment_status}
              onChange={(e) =>
                setForm({
                  ...form,
                  payment_status: e.target.value as PaymentStatus,
                })
              }
            >
              <option value="paid">완료 (바로 결제)</option>
              <option value="pending">외상/미수금</option>
            </Select>
          </Field>
          <Field label="메모">
            <Input
              value={form.memo ?? ""}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              placeholder="예: 봄 신상 10개"
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
