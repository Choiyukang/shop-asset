import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { formatKRW } from "@/lib/utils";
import { useProductStore } from "@/stores/useProductStore";
import type { Product, ProductInput } from "@/types";

const emptyForm: ProductInput = {
  name: "",
  color: "",
  purchase_price: 0,
  sale_price: 0,
  stock: 0,
  memo: "",
};

export function ProductsPage() {
  const { products, load, add, update, remove, loading, error } = useProductStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductInput>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustValue, setAdjustValue] = useState<number>(0);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
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
    });
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("상품명을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: ProductInput = {
        name: form.name.trim(),
        color: form.color?.trim() || null,
        purchase_price: Number(form.purchase_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        stock: Number(form.stock) || 0,
        memo: form.memo?.trim() || null,
      };
      if (editingId) {
        await update(editingId, payload);
      } else {
        await add(payload);
      }
      setOpen(false);
      setForm(emptyForm);
      setEditingId(null);
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
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  등록된 상품이 없습니다.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-b-0">
                <td className="px-4 py-3 font-medium text-neutral-900">{p.name}</td>
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
