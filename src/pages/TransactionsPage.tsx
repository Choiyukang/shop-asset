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
import { useProductStore } from "@/stores/useProductStore";
import { getCurrentUser, syncTransactionToSheet } from "@/lib/db";
import type {
  PaymentStatus,
  TaxType,
  TransactionInput,
  TransactionItemInput,
  TransactionType,
} from "@/types";

const typeLabel: Record<TransactionType, string> = {
  purchase: "구매",
  sale: "판매",
  expense: "지출",
};

interface FormState extends Omit<TransactionInput, "items" | "commission_amount"> {
  items: TransactionItemInput[];
  commission_amount: number;
  commission_overridden: boolean;
}

function emptyForm(): FormState {
  return {
    date: todayISO(),
    type: "purchase",
    counterparty_id: null,
    category_id: "",
    amount: 0,
    memo: "",
    payment_status: "paid",
    items: [],
    commission_amount: 0,
    commission_overridden: false,
  };
}

export function TransactionsPage() {
  const { transactions, load, add, loading, error } = useTransactionStore();
  const { counterparties, load: loadCp } = useCounterpartyStore();
  const { categories, load: loadCat } = useCategoryStore();
  const { products, load: loadProducts } = useProductStore();

  const [open, setOpen] = useState(false);
  const [taxType, setTaxType] = useState<TaxType>("일반과세자");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sheetConfigured, setSheetConfigured] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    loadCp();
    loadCat();
    loadProducts();
    getCurrentUser().then((u) => {
      if (u) {
        setTaxType(u.tax_type);
        setSheetConfigured(!!u.google_sheet_id);
      }
    });
  }, [load, loadCp, loadCat, loadProducts]);

  async function onRetrySync(id: string) {
    setSyncingId(id);
    try {
      await syncTransactionToSheet(id);
      await load();
    } catch (err) {
      console.warn("[google] retry sync failed:", err);
      alert(err instanceof Error ? err.message : "재시도에 실패했습니다.");
    } finally {
      setSyncingId(null);
    }
  }

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const counterpartyMap = useMemo(
    () => new Map(counterparties.map((c) => [c.id, c])),
    [counterparties],
  );
  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  );

  const isItemized = form.type === "purchase" || form.type === "sale";

  const productOptions = useMemo(() => {
    if (form.type === "sale") return products.filter((p) => p.stock > 0);
    return products;
  }, [products, form.type]);

  const itemsTotal = useMemo(
    () =>
      form.items.reduce(
        (sum, it) => sum + Math.trunc(it.quantity) * Math.trunc(it.unit_price),
        0,
      ),
    [form.items],
  );

  const totalAmount = isItemized ? itemsTotal + Math.trunc(form.commission_amount || 0) : form.amount;

  useEffect(() => {
    if (open && filteredCategories.length > 0) {
      setForm((f) => {
        const stillValid = filteredCategories.some((c) => c.id === f.category_id);
        return stillValid ? f : { ...f, category_id: filteredCategories[0]!.id };
      });
    }
  }, [open, filteredCategories]);

  // Auto-fill commission from counterparty's commission_rate (unless user overrode it)
  useEffect(() => {
    if (!isItemized) return;
    if (form.commission_overridden) return;
    const cp = form.counterparty_id ? counterpartyMap.get(form.counterparty_id) : null;
    const rate = cp?.commission_rate ?? 0;
    const auto = Math.round((itemsTotal * rate) / 100);
    setForm((f) => (f.commission_amount === auto ? f : { ...f, commission_amount: auto }));
  }, [isItemized, itemsTotal, form.counterparty_id, form.commission_overridden, counterpartyMap]);

  function resetForm() {
    setForm(emptyForm());
    setFormError(null);
  }

  function addItem() {
    const first = productOptions[0];
    const defaultPrice = first
      ? form.type === "purchase"
        ? first.purchase_price
        : first.sale_price
      : 0;
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          product_id: first?.id ?? "",
          quantity: 1,
          unit_price: defaultPrice,
        },
      ],
    }));
  }

  function updateItem(idx: number, patch: Partial<TransactionItemInput>) {
    setForm((f) => {
      const next = [...f.items];
      const cur = next[idx]!;
      const merged = { ...cur, ...patch };
      // If product changed, refresh unit_price default
      if (patch.product_id && patch.product_id !== cur.product_id) {
        const p = productMap.get(patch.product_id);
        if (p) {
          merged.unit_price =
            f.type === "purchase" ? p.purchase_price : p.sale_price;
        }
      }
      next[idx] = merged;
      return { ...f, items: next };
    });
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.category_id) {
      setFormError("분류를 선택해 주세요.");
      return;
    }
    if (!form.date) {
      setFormError("날짜를 선택해 주세요.");
      return;
    }
    if (isItemized) {
      if (form.items.length === 0) {
        setFormError("상품 항목을 1개 이상 추가해 주세요.");
        return;
      }
      for (const [i, it] of form.items.entries()) {
        if (!it.product_id) {
          setFormError(`${i + 1}번째 행: 상품을 선택해 주세요.`);
          return;
        }
        if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
          setFormError(`${i + 1}번째 행: 수량은 0보다 커야 합니다.`);
          return;
        }
        if (!Number.isFinite(it.unit_price) || it.unit_price < 0) {
          setFormError(`${i + 1}번째 행: 단가는 0 이상이어야 합니다.`);
          return;
        }
      }
      if (form.type === "sale") {
        const overstock = form.items.find((it) => {
          const p = productMap.get(it.product_id);
          return p && it.quantity > p.stock;
        });
        if (overstock) {
          const p = productMap.get(overstock.product_id);
          if (
            !confirm(
              `'${p?.name}'의 현재 재고(${p?.stock})보다 수량(${overstock.quantity})이 많습니다. 그래도 진행할까요?`,
            )
          ) {
            return;
          }
        }
      }
    } else {
      if (!Number.isFinite(form.amount) || form.amount <= 0) {
        setFormError("금액을 0원보다 크게 입력해 주세요.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload: TransactionInput = {
        date: form.date,
        type: form.type,
        counterparty_id: form.counterparty_id,
        category_id: form.category_id,
        amount: isItemized ? totalAmount : form.amount,
        memo: form.memo,
        payment_status: form.payment_status,
        items: isItemized ? form.items : [],
        commission_amount: isItemized ? Math.trunc(form.commission_amount || 0) : 0,
      };
      await add(payload, taxType);
      await loadProducts();
      setOpen(false);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "거래 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderItemsSummary(items?: { quantity: number; product_name?: string; product_color?: string | null }[]) {
    if (!items || items.length === 0) return null;
    return items
      .map((it) => {
        const name = it.product_name ?? "(삭제됨)";
        const color = it.product_color ? `:${it.product_color}` : "";
        return `${name}${color}×${it.quantity}`;
      })
      .join(", ");
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
              <th className="px-4 py-3 font-medium">분류 / 상품</th>
              <th className="px-4 py-3 font-medium">금액</th>
              <th className="px-4 py-3 font-medium">지불</th>
              <th className="px-4 py-3 font-medium">메모</th>
              <th className="px-4 py-3 font-medium">동기화</th>
            </tr>
          </thead>
          <tbody>
            {loading && transactions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && transactions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  아직 등록된 거래가 없습니다. "신규 거래" 버튼으로 첫 거래를 추가하세요.
                </td>
              </tr>
            )}
            {transactions.map((t) => {
              const cat = categoryMap.get(t.category_id);
              const cp = t.counterparty_id ? counterpartyMap.get(t.counterparty_id) : null;
              const itemsSummary = renderItemsSummary(t.items);
              return (
                <tr key={t.id} className="border-b border-neutral-100 last:border-b-0">
                  <td className="px-4 py-3 text-neutral-700">{t.date}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                      {typeLabel[t.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{cp?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-700">
                    <div>{cat?.name ?? "—"}</div>
                    {itemsSummary && (
                      <div className="mt-0.5 text-xs text-neutral-500">{itemsSummary}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    <div>{formatKRW(t.amount)}</div>
                    {t.commission_amount > 0 && (
                      <div className="text-[11px] font-normal text-neutral-500">
                        수수료 {formatKRW(t.commission_amount)} 포함
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {t.payment_status === "paid" ? "완료" : "외상"}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{t.memo ?? ""}</td>
                  <td className="px-4 py-3 text-neutral-500">
                    {t.synced_to_sheet ? (
                      <span className="text-xs text-emerald-600">완료</span>
                    ) : sheetConfigured ? (
                      <button
                        type="button"
                        className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                        onClick={() => onRetrySync(t.id)}
                        disabled={syncingId === t.id}
                        title="구글시트로 재동기화"
                      >
                        {syncingId === t.id ? "동기화…" : "재시도"}
                      </button>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title="신규 거래"
        onClose={() => setOpen(false)}
        className="max-w-2xl"
      >
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
                  setForm({
                    ...form,
                    type: e.target.value as TransactionType,
                    items: [],
                    commission_amount: 0,
                    commission_overridden: false,
                  })
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
                setForm({
                  ...form,
                  counterparty_id: e.target.value || null,
                  commission_overridden: false,
                })
              }
            >
              <option value="">(선택 안 함)</option>
              {counterparties.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name}
                  {cp.commission_rate ? ` (수수료 ${cp.commission_rate}%)` : ""}
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

          {isItemized ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-800">상품 항목</span>
                <Button type="button" size="sm" variant="secondary" onClick={addItem}>
                  + 행 추가
                </Button>
              </div>
              {form.items.length === 0 && (
                <div className="rounded-md border border-dashed border-neutral-300 p-3 text-center text-xs text-neutral-500">
                  상품을 추가해 주세요.
                </div>
              )}
              {form.items.length > 0 && (
                <div className="overflow-hidden rounded-md border border-neutral-200">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                      <tr>
                        <th className="px-2 py-2 font-medium">상품</th>
                        <th className="px-2 py-2 font-medium w-20">수량</th>
                        <th className="px-2 py-2 font-medium w-28">단가</th>
                        <th className="px-2 py-2 font-medium w-28">소계</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((it, idx) => {
                        const subtotal =
                          Math.trunc(it.quantity) * Math.trunc(it.unit_price);
                        return (
                          <tr key={idx} className="border-t border-neutral-100">
                            <td className="px-2 py-1.5">
                              <Select
                                value={it.product_id}
                                onChange={(e) =>
                                  updateItem(idx, { product_id: e.target.value })
                                }
                              >
                                <option value="">선택…</option>
                                {productOptions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                    {p.color ? ` (${p.color})` : ""} · 재고 {p.stock}
                                  </option>
                                ))}
                              </Select>
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                type="number"
                                min={1}
                                value={it.quantity}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    quantity: Number(e.target.value || 0),
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                type="number"
                                min={0}
                                value={it.unit_price}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    unit_price: Number(e.target.value || 0),
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right text-neutral-700">
                              {formatKRW(subtotal)}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                type="button"
                                className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100"
                                onClick={() => removeItem(idx)}
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <Field label="수수료 (원)" hint="거래처 수수료율 기반 자동 계산. 직접 입력 시 우선 적용.">
                <Input
                  type="number"
                  min={0}
                  value={form.commission_amount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      commission_amount: Number(e.target.value || 0),
                      commission_overridden: true,
                    })
                  }
                />
              </Field>
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <div className="flex justify-between text-neutral-600">
                  <span>상품 합계</span>
                  <span>{formatKRW(itemsTotal)}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>수수료</span>
                  <span>{formatKRW(Math.trunc(form.commission_amount || 0))}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
                  <span>총 금액</span>
                  <span>{formatKRW(totalAmount)}</span>
                </div>
              </div>
            </div>
          ) : (
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
          )}

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
