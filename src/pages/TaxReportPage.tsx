import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTaxReport } from "@/lib/db";
import { formatKRW } from "@/lib/utils";
import type { TaxReportRow } from "@/types";

const PERIODS = [
  {
    label: "1기 예정 (1~3월)",
    key: "1-pre",
    getRange: (y: number) => ({ start: `${y}-01-01`, end: `${y}-03-31` }),
  },
  {
    label: "1기 확정 (1~6월)",
    key: "1-final",
    getRange: (y: number) => ({ start: `${y}-01-01`, end: `${y}-06-30` }),
  },
  {
    label: "2기 예정 (7~9월)",
    key: "2-pre",
    getRange: (y: number) => ({ start: `${y}-07-01`, end: `${y}-09-30` }),
  },
  {
    label: "2기 확정 (7~12월)",
    key: "2-final",
    getRange: (y: number) => ({ start: `${y}-07-01`, end: `${y}-12-31` }),
  },
];

const TYPE_KO: Record<string, string> = {
  purchase: "매입",
  sale: "매출",
  expense: "지출",
};

function toCSV(rows: TaxReportRow[]): string {
  const header = ["거래일", "유형", "거래처", "분류", "금액", "공급가액", "부가세", "환급여부", "메모"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.date,
        TYPE_KO[r.transactionType] ?? r.transactionType,
        `"${r.counterparty}"`,
        `"${r.category}"`,
        r.amount,
        r.supplyAmount,
        r.vatAmount,
        r.isRefundable ? "환급" : "-",
        `"${r.memo}"`,
      ].join(","),
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

export function TaxReportPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [periodKey, setPeriodKey] = useState("1-pre");
  const [rows, setRows] = useState<TaxReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[0]!;

  async function handleLoad() {
    setLoading(true);
    setError(null);
    setFetched(false);
    try {
      const { start, end } = selectedPeriod.getRange(year);
      const data = await getTaxReport(start, end);
      setRows(data);
      setFetched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    const { start, end } = selectedPeriod.getRange(year);
    downloadCSV(
      toCSV(rows),
      `부가세_${year}년_${selectedPeriod.label}_${start}_${end}.csv`,
    );
  }

  const totalVat = rows.reduce((s, r) => s + r.vatAmount, 0);
  const refundableVat = rows
    .filter((r) => r.isRefundable)
    .reduce((s, r) => s + r.vatAmount, 0);
  const payableVat = rows
    .filter((r) => !r.isRefundable && r.transactionType === "sale")
    .reduce((s, r) => s + r.vatAmount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">부가세 신고</h1>
        <p className="text-sm text-neutral-500">신고 기간을 선택하고 CSV로 내보내세요</p>
      </div>

      {/* 기간 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>신고 기간 선택</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-32">
              <Field label="연도">
                <Select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {[currentYear - 1, currentYear].map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-52">
              <Field label="신고 기간">
                <Select
                  value={periodKey}
                  onChange={(e) => setPeriodKey(e.target.value)}
                >
                  {PERIODS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button onClick={handleLoad} disabled={loading}>
              {loading ? "불러오는 중…" : "조회"}
            </Button>
          </div>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 요약 카드 */}
      {fetched && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent>
                <div className="text-xs text-neutral-500">총 부가세</div>
                <div className="mt-1 text-xl font-semibold text-neutral-900">
                  {formatKRW(totalVat)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-xs text-emerald-600">환급 세액 (매입)</div>
                <div className="mt-1 text-xl font-semibold text-emerald-700">
                  {formatKRW(refundableVat)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-xs text-red-600">납부 세액 (매출 − 매입)</div>
                <div className="mt-1 text-xl font-semibold text-red-700">
                  {formatKRW(Math.max(0, payableVat - refundableVat))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 거래 테이블 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>세금 내역 ({rows.length}건)</CardTitle>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExport}
                  disabled={rows.length === 0}
                >
                  CSV 내보내기
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-500">
                  해당 기간에 거래가 없습니다.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-600">
                      <tr>
                        <th className="px-4 py-3 text-left">거래일</th>
                        <th className="px-4 py-3 text-left">유형</th>
                        <th className="px-4 py-3 text-left">거래처</th>
                        <th className="px-4 py-3 text-right">공급가액</th>
                        <th className="px-4 py-3 text-right">부가세</th>
                        <th className="px-4 py-3 text-center">환급</th>
                        <th className="px-4 py-3 text-left">메모</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {rows.map((r, i) => (
                        <tr key={i} className="hover:bg-neutral-50">
                          <td className="px-4 py-2.5 text-neutral-700">{r.date}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                r.transactionType === "sale"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : r.transactionType === "purchase"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {TYPE_KO[r.transactionType] ?? r.transactionType}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-neutral-700">
                            {r.counterparty || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-neutral-900">
                            {formatKRW(r.supplyAmount)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-neutral-900">
                            {formatKRW(r.vatAmount)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {r.isRefundable ? (
                              <span className="text-xs font-medium text-emerald-600">환급</span>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-neutral-500">{r.memo || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
