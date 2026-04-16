import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMonthlyStats } from "@/lib/db";
import { formatKRW } from "@/lib/utils";
import type { MonthlyStats } from "@/types";

const MONTH_OPTIONS = [
  { label: "최근 3개월", value: "3" },
  { label: "최근 6개월", value: "6" },
  { label: "최근 12개월", value: "12" },
  { label: "직접 입력(개월)", value: "custom" },
];

function BarChart({ data }: { data: MonthlyStats[] }) {
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => Math.max(d.sales, d.expense, 1)));
  const chartH = 180;
  const barW = 20;
  const gap = 8;
  const groupW = barW * 2 + gap + 16;
  const svgW = data.length * groupW + 40;

  return (
    <div className="overflow-x-auto">
      <svg width={svgW} height={chartH + 52} className="block mx-auto">
        {/* Y axis gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = 8 + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={32} x2={svgW - 4} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={28} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                {pct === 0 ? "0" : Math.round(maxVal * pct).toLocaleString("ko-KR")}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = 36 + i * groupW;
          const salesH = Math.max(2, (d.sales / maxVal) * chartH);
          const expH = Math.max(2, (d.expense / maxVal) * chartH);
          const netIncome = d.sales - d.expense;

          return (
            <g key={d.month}>
              {/* Sales bar */}
              <rect
                x={x}
                y={8 + chartH - salesH}
                width={barW}
                height={salesH}
                rx={3}
                fill="#10b981"
                opacity={0.85}
              />
              {/* Expense bar */}
              <rect
                x={x + barW + gap}
                y={8 + chartH - expH}
                width={barW}
                height={expH}
                rx={3}
                fill="#ef4444"
                opacity={0.75}
              />
              {/* Month label */}
              <text
                x={x + barW + gap / 2}
                y={chartH + 20}
                textAnchor="middle"
                fontSize={10}
                fill="#6b7280"
              >
                {d.month.slice(5)}월
              </text>
              {/* Net income */}
              <text
                x={x + barW + gap / 2}
                y={chartH + 34}
                textAnchor="middle"
                fontSize={9}
                fill={netIncome >= 0 ? "#10b981" : "#ef4444"}
                fontWeight="600"
              >
                {netIncome >= 0 ? "+" : "-"}
                {Math.abs(Math.trunc(netIncome)).toLocaleString("ko-KR")}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex justify-center gap-6 text-xs text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-emerald-500 opacity-85" />
          매출
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-red-500 opacity-75" />
          지출
        </span>
      </div>
    </div>
  );
}

function toCSV(data: MonthlyStats[]): string {
  const header = ["월", "매출", "지출", "순이익"];
  const lines = [
    header.join(","),
    ...data.map((d) =>
      [d.month, d.sales, d.expense, d.sales - d.expense].join(","),
    ),
  ];
  return lines.join("\r\n");
}

function downloadCSV(content: string, filename: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PnlPage() {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [months, setMonths] = useState(6);
  const [customMonths, setCustomMonths] = useState(6);
  const [data, setData] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMonthlyStats(months)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, [months]);

  const totalSales = data.reduce((s, d) => s + d.sales, 0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);
  const totalNet = totalSales - totalExpense;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">월별 손익 리포트</h1>
          <p className="text-sm text-neutral-500">매출·지출·순이익 추이를 확인합니다</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-44">
            <Field label="기간">
              <Select
                value={mode === "preset" ? String(months) : mode}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") {
                    setMode("custom");
                    setMonths(customMonths);
                  } else {
                    setMode("preset");
                    setMonths(Number(v));
                  }
                }}
              >
                {MONTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          {mode === "custom" && (
            <div className="w-28">
              <Field label="개월 수">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={customMonths}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(120, Number(e.target.value) || 1));
                    setCustomMonths(n);
                    setMonths(n);
                  }}
                  className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm focus:border-neutral-500 focus:outline-none"
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent>
            <div className="text-xs text-emerald-600">총 매출</div>
            <div className="mt-1 text-xl font-semibold text-emerald-700">{formatKRW(totalSales)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-xs text-red-600">총 지출</div>
            <div className="mt-1 text-xl font-semibold text-red-700">{formatKRW(totalExpense)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-xs text-neutral-500">순이익</div>
            <div className={`mt-1 text-xl font-semibold ${totalNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {formatKRW(totalNet)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>월별 추이</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-neutral-500">불러오는 중…</div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500">거래 데이터가 없습니다.</div>
          ) : (
            <BarChart data={data} />
          )}
        </CardContent>
      </Card>

      {/* 테이블 */}
      {!loading && data.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>상세 내역</CardTitle>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadCSV(toCSV(data), `손익리포트_최근${months}개월.csv`)}
              >
                CSV 내보내기
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-600">
                <tr>
                  <th className="px-4 py-3 text-left">월</th>
                  <th className="px-4 py-3 text-right">매출</th>
                  <th className="px-4 py-3 text-right">지출</th>
                  <th className="px-4 py-3 text-right">순이익</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {[...data].reverse().map((d) => {
                  const net = d.sales - d.expense;
                  return (
                    <tr key={d.month} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 font-medium text-neutral-900">{d.month}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">{formatKRW(d.sales)}</td>
                      <td className="px-4 py-2.5 text-right text-red-700">{formatKRW(d.expense)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${net >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {net >= 0 ? "+" : ""}{formatKRW(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
