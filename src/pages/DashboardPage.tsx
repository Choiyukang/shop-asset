import { useEffect, useState } from "react";
import { StatCard } from "@/components/ui/card";
import { formatKRW } from "@/lib/utils";
import {
  getCurrentMonthSummary,
  getCurrentUser,
  getMonthlyStats,
  getNextTaxDeadline,
  getOverdueReceivables,
  getLowStockProducts,
  getPendingDeliveryProducts,
  getTodayUnpaidBySupplier,
} from "@/lib/db";
import type {
  DashboardSummary,
  MonthlyStats,
  OverdueReceivable,
  Product,
  SupplierUnpaidTotal,
  TaxDeadlineInfo,
} from "@/types";

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>({
    sales: 0,
    expense: 0,
    netIncome: 0,
    count: 0,
  });
  const [unpaid, setUnpaid] = useState<SupplierUnpaidTotal[]>([]);
  const [receivables, setReceivables] = useState<OverdueReceivable[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [pendingDelivery, setPendingDelivery] = useState<Product[]>([]);
  const [taxDeadline, setTaxDeadline] = useState<TaxDeadlineInfo | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [salesGoal, setSalesGoal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const [s, u, r, ls, tax, ms, user, pd] = await Promise.all([
          getCurrentMonthSummary(year, month),
          getTodayUnpaidBySupplier(),
          getOverdueReceivables(),
          getLowStockProducts(5),
          getNextTaxDeadline(),
          getMonthlyStats(6),
          getCurrentUser(),
          getPendingDeliveryProducts(),
        ]);
        if (!canceled) {
          setSummary(s);
          setUnpaid(u);
          setReceivables(r);
          setLowStock(ls);
          setTaxDeadline(tax);
          setMonthlyStats(ms);
          if (user?.monthly_sales_goal) setSalesGoal(user.monthly_sales_goal);
          setPendingDelivery(pd);
        }
      } catch (e) {
        if (!canceled)
          setError(e instanceof Error ? e.message : "대시보드를 불러오지 못했습니다.");
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [year, month]);

  const unpaidTotal = unpaid.reduce((sum, u) => sum + u.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-sm text-neutral-500">
          {year}년 {month}월 요약
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="이번 달 매출" value={loading ? "—" : formatKRW(summary.sales)} tone="positive" />
        <StatCard label="이번 달 지출" value={loading ? "—" : formatKRW(summary.expense)} tone="negative" />
        <StatCard
          label="순이익"
          value={loading ? "—" : formatKRW(summary.netIncome)}
          tone={summary.netIncome >= 0 ? "positive" : "negative"}
        />
        <StatCard label="거래 건수" value={loading ? "—" : `${summary.count}건`} />
      </div>

      {salesGoal > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">이번 달 목표 매출</h2>
              <p className="text-xs text-neutral-500">
                {formatKRW(summary.sales)} / {formatKRW(salesGoal)}
              </p>
            </div>
            <span className={`text-lg font-bold ${
              summary.sales >= salesGoal ? "text-emerald-600" : "text-neutral-700"
            }`}>
              {Math.min(100, Math.round((summary.sales / salesGoal) * 100))}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full rounded-full transition-all ${
                summary.sales >= salesGoal ? "bg-emerald-500" : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(100, (summary.sales / salesGoal) * 100)}%` }}
            />
          </div>
          {summary.sales >= salesGoal && (
            <p className="mt-2 text-xs font-medium text-emerald-600">🎉 목표 달성!</p>
          )}
        </div>
      )}

      {/* 2열 그리드 row 1: 오늘 삼촌에게 줄 돈 | 미수금 현황 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">오늘 삼촌에게 줄 돈</h2>
              <p className="text-xs text-neutral-500">오늘 외상으로 처리된 사입 합계 (수수료 포함)</p>
            </div>
            {unpaid.length > 0 && (
              <span className="text-sm font-semibold text-neutral-900">
                합계 {formatKRW(unpaidTotal)}
              </span>
            )}
          </div>
          {loading ? (
            <p className="text-sm text-neutral-500">불러오는 중…</p>
          ) : unpaid.length === 0 ? (
            <p className="text-sm text-neutral-500">오늘 외상 없음</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {unpaid.map((u) => (
                <li key={u.counterparty.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-neutral-800">{u.counterparty.name}</span>
                  <span className="font-medium text-neutral-900">{formatKRW(u.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">미수금 현황</h2>
              <p className="text-xs text-neutral-500">결제 대기 중인 판매 미수금</p>
            </div>
            {receivables.length > 0 && (
              <span className="text-sm font-semibold text-neutral-900">
                합계 {formatKRW(receivables.reduce((s, r) => s + r.total, 0))}
              </span>
            )}
          </div>
          {loading ? (
            <p className="text-sm text-neutral-500">불러오는 중…</p>
          ) : receivables.length === 0 ? (
            <p className="text-sm text-neutral-500">미수금 없음</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {receivables.map((r) => (
                <li key={r.counterparty.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-800">{r.counterparty.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        r.daysPending >= 30
                          ? "bg-red-100 text-red-700"
                          : r.daysPending >= 7
                          ? "bg-amber-100 text-amber-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {r.daysPending}일 경과
                    </span>
                  </div>
                  <span className="font-medium text-neutral-900">{formatKRW(r.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 2열 그리드 row 2: 재고 부족 | 미송 현황 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-neutral-900">재고 부족 알림</h2>
            <p className="text-xs text-neutral-500">재고 5개 이하 상품</p>
          </div>
          {loading ? (
            <p className="text-sm text-neutral-500">불러오는 중…</p>
          ) : lowStock.length === 0 ? (
            <p className="text-sm text-neutral-500">재고 부족 상품 없음</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-800">{p.name}</span>
                    {p.color && <span className="text-xs text-neutral-500">{p.color}</span>}
                  </div>
                  <span className={`font-semibold ${p.stock === 0 ? "text-red-600" : "text-amber-600"}`}>
                    {p.stock === 0 ? "품절" : `${p.stock}개`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-neutral-900">미송 현황</h2>
            <p className="text-xs text-neutral-500">주문 후 아직 입고 전인 상품</p>
          </div>
          {loading ? (
            <p className="text-sm text-neutral-500">불러오는 중…</p>
          ) : pendingDelivery.length === 0 ? (
            <p className="text-sm text-neutral-500">미송 상품 없음</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {pendingDelivery.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-800">{p.name}</span>
                    {p.color && <span className="text-xs text-neutral-500">{p.color}</span>}
                  </div>
                  <span className="text-xs text-amber-600 font-medium">
                    {p.expected_arrival_date ? `입고 예정 ${p.expected_arrival_date}` : "입고일 미정"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 2열 그리드 row 3: 현금흐름 예측 | 부가세 D-day */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(() => {
          const recent = monthlyStats.slice(-3);
          const avgSales = recent.length
            ? Math.round(recent.reduce((s, m) => s + m.sales, 0) / recent.length)
            : 0;
          const avgExpense = recent.length
            ? Math.round(recent.reduce((s, m) => s + m.expense, 0) / recent.length)
            : 0;
          const nextMonth = (() => {
            const d = new Date(year, month, 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          })();
          return (
            <div className="rounded-lg border border-neutral-200 bg-white p-5">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-neutral-900">현금흐름 예측</h2>
                <p className="text-xs text-neutral-500">최근 3개월 평균 기반 · {nextMonth} 예상</p>
              </div>
              {loading ? (
                <p className="text-sm text-neutral-500">불러오는 중…</p>
              ) : monthlyStats.length === 0 ? (
                <p className="text-sm text-neutral-500">거래 데이터가 부족합니다</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-emerald-50 p-3">
                      <div className="text-xs text-emerald-700">예상 매출</div>
                      <div className="mt-1 text-lg font-semibold text-emerald-800">{formatKRW(avgSales)}</div>
                    </div>
                    <div className="rounded-md bg-red-50 p-3">
                      <div className="text-xs text-red-700">예상 지출</div>
                      <div className="mt-1 text-lg font-semibold text-red-800">{formatKRW(avgExpense)}</div>
                    </div>
                  </div>
                  <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm">
                    <span className="text-neutral-500">예상 순이익 </span>
                    <span className={`font-semibold ${avgSales - avgExpense >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {formatKRW(avgSales - avgExpense)}
                    </span>
                    <span className="ml-2 text-xs text-neutral-400">(최근 {recent.length}개월 평균)</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {taxDeadline && (
          <div
            className={`rounded-lg border p-5 ${
              taxDeadline.daysLeft <= 7
                ? "border-red-200 bg-red-50"
                : taxDeadline.daysLeft <= 30
                ? "border-amber-200 bg-amber-50"
                : "border-neutral-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">부가세 신고 D-day</h2>
                <p className="text-xs text-neutral-500">{taxDeadline.periodLabel}</p>
              </div>
              <span
                className={`text-2xl font-bold ${
                  taxDeadline.daysLeft <= 7
                    ? "text-red-600"
                    : taxDeadline.daysLeft <= 30
                    ? "text-amber-600"
                    : "text-neutral-700"
                }`}
              >
                D-{taxDeadline.daysLeft}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-neutral-600">신고 기한: {taxDeadline.deadlineDate}</span>
              <span className="font-medium text-neutral-900">예상 납부세액 {formatKRW(taxDeadline.estimatedVat)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
