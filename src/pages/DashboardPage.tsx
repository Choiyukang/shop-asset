import { useEffect, useState } from "react";
import { StatCard } from "@/components/ui/card";
import { formatKRW } from "@/lib/utils";
import { getCurrentMonthSummary, getTodayUnpaidBySupplier } from "@/lib/db";
import type { DashboardSummary, SupplierUnpaidTotal } from "@/types";

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>({
    sales: 0,
    expense: 0,
    netIncome: 0,
    count: 0,
  });
  const [unpaid, setUnpaid] = useState<SupplierUnpaidTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const [s, u] = await Promise.all([
          getCurrentMonthSummary(year, month),
          getTodayUnpaidBySupplier(),
        ]);
        if (!canceled) {
          setSummary(s);
          setUnpaid(u);
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

      <div className="rounded-md border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        <p className="font-medium text-neutral-800">시작하기</p>
        <p className="mt-2">
          "거래 내역"에서 첫 거래를 등록해 보세요. 거래를 저장하면 부가세가 자동 분리되어 세금기록에
          저장됩니다.
        </p>
      </div>
    </div>
  );
}
