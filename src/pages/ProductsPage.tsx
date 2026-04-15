import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { formatKRW } from "@/lib/utils";
import { useProductStore } from "@/stores/useProductStore";
import { useCounterpartyStore } from "@/stores/useCounterpartyStore";
import { Select } from "@/components/ui/select";
import type { Product, ProductInput } from "@/types";

const emptyForm: ProductInput = {
  name: "",
  color: "",
  purchase_price: 0,
  sale_price: 0,
  stock: 0,
  memo: "",
  counterparty_id: null,
  purchase_date: null,
  is_pending_delivery: false,
  expected_arrival_date: null,
};

interface ColorRow {
  color: string;
  stock: number;
  is_pending_delivery: boolean;
  expected_arrival_date: string | null;
}

const emptyColorRow: ColorRow = {
  color: "",
  stock: 0,
  is_pending_delivery: false,
  expected_arrival_date: null,
};

export function ProductsPage() {
  const { products, load, add, update, remove, loading, error } = useProductStore();
  const { counterparties, load: loadCp } = useCounterpartyStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductInput>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustValue, setAdjustValue] = useState<number>(0);

  const [createShared, setCreateShared] = useState({
    name: "",
    purchase_price: 0,
    sale_price: 0,
    memo: "",
    counterparty_id: null as string | null,
    purchase_date: null as string | null,
  });
  const [colorRows, setColorRows] = useState<ColorRow[]>([{ ...emptyColorRow }]);

  useEffect(() => {
    load();
    loadCp();
  }, [load, loadCp]);

  function openCreate() {
    setEditingId(null);
    setCreateShared({ name: "", purchase_price: 0, sale_price: 0, memo: "", counterparty_id: null, purchase_date: null });
    setColorRows([{ ...emptyColorRow }]);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      color: p.color ?? "",
      purchase_price: p.purchase_price,
      sale_price: p.sale_price,
      stock: p.stock,
      memo: p.memo ?? "",
      counterparty_id: p.counterparty_id ?? null,
      purchase_date: p.purchase_date ?? null,
      is_pending_delivery: p.is_pending_delivery ?? false,
      expected_arrival_date: p.expected_arrival_date ?? null,
    });
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (editingId) {
      if (!form.name.trim()) { setFormError("상품명을 입력해 주세요."); return; }
      setSubmitting(true);
      try {
        const payload: ProductInput = {
          name: form.name.trim(),
          color: form.color?.trim() || null,
          purchase_price: Number(form.purchase_price) || 0,
          sale_price: Number(form.sale_price) || 0,
          stock: Number(form.stock) || 0,
          memo: form.memo?.trim() || null,
          counterparty_id: form.counterparty_id ?? null,
          purchase_date: form.purchase_date ?? null,
          is_pending_delivery: form.is_pending_delivery ?? false,
          expected_arrival_date: form.expected_arrival_date ?? null,
        };
        await update(editingId, payload);
        setOpen(false);
        setEditingId(null);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 신규 등록
    if (!createShared.name.trim()) { setFormError("상품명을 입력해 주세요."); return; }
    if (colorRows.length === 0) { setFormError("색상을 최소 1개 입력해 주세요."); return; }
    setSubmitting(true);
    try {
      for (const cr of colorRows) {
        await add({
          name: createShared.name.trim(),
          color: cr.color.trim() || null,
          purchase_price: Number(createShared.purchase_price) || 0,
          sale_price: Number(createShared.sale_price) || 0,
          stock: Number(cr.stock) || 0,
          memo: createShared.memo?.trim() || null,
          counterparty_id: createShared.counterparty_id ?? null,
          purchase_date: createShared.purchase_date ?? null,
          is_pending_delivery: cr.is_pending_delivery,
          expected_arrival_date: cr.expected_arrival_date,
        });
      }
      setOpen(false);
      setColorRows([{ ...emptyColorRow }]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(p: Product) {
    if (!confirm(`'${p.name}' 상품을 삭제할까요? 거래에 사용된 상품은 삭제할 수 없습니다.`)) return;
    try {
      await remove(p.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  }

  function openAdjust(p: Product) {
    setAdjustTarget(p);
    setAdjustValue(p.stock);
  }

  async function onAdjust() {
    if (!adjustTarget) return;
    try {
      await update(adjustTarget.id, { stock: Math.trunc(Number(adjustValue) || 0) });
      setAdjustTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "재고 조정에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">상품</h1>
          <p className="text-sm text-neutral-500">사입가 · 판매가 · 재고를 관리합니다.</p>
        </div>
        <Button onClick={openCreate}>신규 상품</Button>
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
              <th className="px-4 py-3 font-medium">상품명</th>
              <th className="px-4 py-3 font-medium">거래처</th>
              <th className="px-4 py-3 font-medium">사입날짜</th>
              <th className="px-4 py-3 font-medium">깔(컬러)</th>
              <th className="px-4 py-3 font-medium">사입가</th>
              <th className="px-4 py-3 font-medium">판매가</th>
              <th className="px-4 py-3 font-medium">마진율</th>
              <th className="px-4 py-3 font-medium">현재고</th>
              <th className="px-4 py-3 font-medium">메모</th>
              <th className="px-4 py-3 font-medium">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading && products.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-neutral-500">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-neutral-500">
                  등록된 상품이 없습니다.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-b-0">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  <div className="flex items-center gap-1.5">
                    {p.name}
                    {p.is_pending_delivery && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        미송
                      </span>
                    )}
                  </div>
                  {p.is_pending_delivery && p.expected_arrival_date && (
                    <div className="text-xs text-amber-600">입고 예정 {p.expected_arrival_date}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500 text-sm">
                  {counterparties.find(c => c.id === p.counterparty_id)?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-neutral-500">{p.purchase_date ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-700">{p.color ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-700">{formatKRW(p.purchase_price)}</td>
                <td className="px-4 py-3 text-neutral-700">{formatKRW(p.sale_price)}</td>
                {(() => {
                  if (!p.purchase_price || p.purchase_price === 0) {
                    return <td className="px-4 py-3 text-neutral-400">—</td>;
                  }
                  const margin = Math.round(((p.sale_price - p.purchase_price) / p.purchase_price) * 100);
                  const colorClass =
                    margin < 0
                      ? "text-red-600 font-semibold"
                      : margin < 20
                      ? "text-amber-600"
                      : "text-emerald-700";
                  return (
                    <td className={`px-4 py-3 ${colorClass}`}>
                      {margin > 0 ? "+" : ""}{margin}%
                    </td>
                  );
                })()}
                <td className="px-4 py-3 text-neutral-700">{p.stock}</td>
                <td className="px-4 py-3 text-neutral-500">{p.memo ?? ""}</td>
                <td className="px-4 py-3 text-neutral-500">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
                      onClick={() => openEdit(p)}
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
                      onClick={() => openAdjust(p)}
                    >
                      재고 조정
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => onDelete(p)}
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400">
        마진율 색상: <span className="text-emerald-700">20%↑ 양호</span> · <span className="text-amber-600">0~19% 주의</span> · <span className="text-red-600">음수 손실</span>
      </p>

      <Modal
        open={open}
        title={editingId ? "상품 편집" : "신규 상품"}
        onClose={() => setOpen(false)}
      >
        {editingId ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="상품명" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 봄 원피스"
              />
            </Field>
            <Field label="깔(컬러)">
              <Input
                value={form.color ?? ""}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="예: 블랙 / 화이트"
              />
            </Field>
            <Field label="기본 거래처" hint="이 상품을 주로 구매하는 삼촌/공급업체">
              <Select
                value={form.counterparty_id ?? ""}
                onChange={(e) => setForm({ ...form, counterparty_id: e.target.value || null })}
              >
                <option value="">(선택 안 함)</option>
                {counterparties.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="사입날짜" hint="이 상품을 처음 사입한 날짜">
              <Input
                type="date"
                value={form.purchase_date ?? ""}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value || null })}
              />
            </Field>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_pending_delivery ?? false}
                  onChange={(e) => setForm({
                    ...form,
                    is_pending_delivery: e.target.checked,
                    expected_arrival_date: e.target.checked ? form.expected_arrival_date : null,
                  })}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                <span className="text-sm font-medium text-neutral-700">미송 (주문했지만 아직 미입고)</span>
              </label>
              {form.is_pending_delivery && (
                <Field label="입고 예정일">
                  <Input
                    type="date"
                    value={form.expected_arrival_date ?? ""}
                    onChange={(e) => setForm({ ...form, expected_arrival_date: e.target.value || null })}
                  />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="사입가 (원)">
                <Input
                  type="number"
                  min={0}
                  value={form.purchase_price === 0 ? "" : form.purchase_price}
                  onChange={(e) =>
                    setForm({ ...form, purchase_price: Number(e.target.value || 0) })
                  }
                  placeholder="예: 10000"
                />
              </Field>
              <Field label="판매가 (원)">
                <Input
                  type="number"
                  min={0}
                  value={form.sale_price === 0 ? "" : form.sale_price}
                  onChange={(e) =>
                    setForm({ ...form, sale_price: Number(e.target.value || 0) })
                  }
                  placeholder="예: 25000"
                />
              </Field>
            </div>
            <Field
              label="초기 재고"
              hint="거래 입력 시 자동 변동. 직접 보정은 '재고 조정' 버튼을 사용하세요."
            >
              <Input
                type="number"
                min={0}
                value={form.stock === 0 ? "" : form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value || 0) })}
                placeholder="0"
              />
            </Field>
            <Field label="메모">
              <Input
                value={form.memo ?? ""}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
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
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {/* 공통 필드 */}
            <Field label="상품명" required>
              <Input value={createShared.name} onChange={e => setCreateShared({...createShared, name: e.target.value})} placeholder="예: 봄 원피스" />
            </Field>
            <Field label="기본 거래처" hint="이 상품을 주로 구매하는 삼촌/공급업체">
              <Select value={createShared.counterparty_id ?? ""} onChange={e => setCreateShared({...createShared, counterparty_id: e.target.value || null})}>
                <option value="">(선택 안 함)</option>
                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="사입날짜">
              <Input type="date" value={createShared.purchase_date ?? ""} onChange={e => setCreateShared({...createShared, purchase_date: e.target.value || null})} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="사입가 (원)">
                <Input type="number" min={0} value={createShared.purchase_price === 0 ? "" : createShared.purchase_price} onChange={e => setCreateShared({...createShared, purchase_price: Number(e.target.value || 0)})} placeholder="예: 10000" />
              </Field>
              <Field label="판매가 (원)">
                <Input type="number" min={0} value={createShared.sale_price === 0 ? "" : createShared.sale_price} onChange={e => setCreateShared({...createShared, sale_price: Number(e.target.value || 0)})} placeholder="예: 25000" />
              </Field>
            </div>
            <Field label="메모">
              <Input value={createShared.memo ?? ""} onChange={e => setCreateShared({...createShared, memo: e.target.value})} />
            </Field>

            {/* 색상 행들 */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-700">색상별 재고</span>
                <button
                  type="button"
                  className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
                  onClick={() => setColorRows([...colorRows, { ...emptyColorRow }])}
                >
                  + 색상 추가
                </button>
              </div>
              <div className="space-y-2">
                {colorRows.map((cr, i) => (
                  <div key={i} className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        className="flex-1"
                        value={cr.color}
                        onChange={e => { const next = [...colorRows]; next[i] = {...cr, color: e.target.value}; setColorRows(next); }}
                        placeholder="색상 (예: 흰색, 블랙)"
                      />
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={cr.stock === 0 ? "" : cr.stock}
                        onChange={e => { const next = [...colorRows]; next[i] = {...cr, stock: Number(e.target.value || 0)}; setColorRows(next); }}
                        placeholder="재고"
                      />
                      {colorRows.length > 1 && (
                        <button
                          type="button"
                          className="text-red-500 hover:text-red-700 text-sm px-1"
                          onClick={() => setColorRows(colorRows.filter((_, j) => j !== i))}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cr.is_pending_delivery}
                        onChange={e => { const next = [...colorRows]; next[i] = {...cr, is_pending_delivery: e.target.checked, expected_arrival_date: e.target.checked ? cr.expected_arrival_date : null}; setColorRows(next); }}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                      <span className="text-xs text-neutral-600">미송 (주문했지만 아직 미입고)</span>
                    </label>
                    {cr.is_pending_delivery && (
                      <Field label="입고 예정일">
                        <Input
                          type="date"
                          value={cr.expected_arrival_date ?? ""}
                          onChange={e => { const next = [...colorRows]; next[i] = {...cr, expected_arrival_date: e.target.value || null}; setColorRows(next); }}
                        />
                      </Field>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{formError}</div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>취소</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "저장 중…" : `저장 (${colorRows.length}가지 색상)`}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!adjustTarget}
        title="재고 조정"
        onClose={() => setAdjustTarget(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            <strong>{adjustTarget?.name}</strong>의 현재 재고를 직접 입력한 값으로 설정합니다.
          </p>
          <Field label="새 재고 수량">
            <Input
              type="number"
              min={0}
              value={adjustValue}
              onChange={(e) => setAdjustValue(Number(e.target.value || 0))}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAdjustTarget(null)}
            >
              취소
            </Button>
            <Button type="button" onClick={onAdjust}>
              조정
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
