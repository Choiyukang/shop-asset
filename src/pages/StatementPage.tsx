import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCounterparties, getCounterpartyStatement, exportStatementToSheet } from "@/lib/db";
import type { StatementRow } from "@/lib/db";
import { formatKRW } from "@/lib/utils";
import type { Counterparty } from "@/types";

const TYPE_KO: Record<string, string> = {
  purchase: "구매",
  sale: "판매",
  expense: "지출",
};

function toCSV(cp: Counterparty, year: number, month: number, rows: StatementRow[]): string {
  const mm = String(month).padStart(2, "0");
  const header = ["거래일", "유형", "분류", "금액", "수수료", "결제상태", "메모"];
  const lines = [
    `거래처: ${cp.name}`,
    `기간: ${year}-${mm}`,
    "",
    header.join(","),
    ...rows.map((r) =>
      [
        r.date,
        TYPE_KO[r.type] ?? r.type,
        `"${r.category}"`,
        r.amount,
        r.commission_amount,
        r.payment_status === "paid" ? "완료" : "대납",
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

export function StatementPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [cpId, setCpId] = useState("");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [fetched, setFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetExporting, setSheetExporting] = useState(false);
  const [sheetMsg, setSheetMsg] = useState<string | null>(null);

  useEffect(() => {
    listCounterparties().then((list) => {
      setCounterparties(list);
      if (list.length > 0) setCpId(list[0]!.id);
    });
  }, []);

  const selectedCp = counterparties.find((c) => c.id === cpId);

  async function handleLoad() {
    if (!cpId) return;
    setLoading(true);
    setError(null);
    setFetched(false);
    try {
      const mm = String(month).padStart(2, "0");
      const daysInMonth = new Date(year, month, 0).getDate();
      const start = `${year}-${mm}-01`;
      const end = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
      const data = await getCounterpartyStatement(cpId, start, end);
      setRows(data);
      setFetched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const onExportToSheet = async () => {
    if (!cpId) return;
    setSheetExporting(true);
    setSheetMsg(null);
    try {
      await exportStatementToSheet(cpId, year, month);
      setSheetMsg("시트 탭 내보내기 완료");
    } catch (e) {
      setSheetMsg(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setSheetExporting(false);
    }
  };

  function handleExport() {
    if (!selectedCp) return;
    const mm = String(month).padStart(2, "0");
    downloadCSV(
      toCSV(selectedCp, year, month, rows),
      `정산서_${selectedCp.name}_${year}${mm}.csv`,
    );
  }

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const paidAmount = rows.filter((r) => r.payment_status === "paid").reduce((s, r) => s + r.amount, 0);
  const pendingAmount = rows.filter((r) => r.payment_status === "pending").reduce((s, r) => s + r.amount, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission_amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">거래처 정산서</h1>
        <p className="text-sm text-neutral-500">거래처별 월 거래 내역을 조회하고 CSV로 내보냅니다</p>
      </div>

      {/* 조회 조건 */}
      <Card>
        <CardHeader>
          <CardTitle>조회 조건</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-48">
              <Field label="거래처">
                <Select value={cpId} onChange={(e) => setCpId(e.target.value)}>
                  {counterparties.length === 0 && (
                    <option value="">거래처 없음</option>
                  )}
                  {counterparties.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-28">
              <Field label="연도">
                <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {[currentYear - 1, currentYear].map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-28">
              <Field label="월">
                <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button onClick={handleLoad} disabled={loading || !cpId}>
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

      {fetched && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent>
                <div className="text-xs text-neutral-500">총 거래금액</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">{formatKRW(totalAmount)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-xs text-emerald-600">결제 완료</div>
                <div className="mt-1 text-lg font-semibold text-emerald-700">{formatKRW(paidAmount)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-xs text-orange-600">대납 (미결제)</div>
                <div className="mt-1 text-lg font-semibold text-orange-700">{formatKRW(pendingAmount)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-xs text-neutral-500">수수료 합계</div>
                <div className="mt-1 text-lg font-semibold text-neutral-700">{formatKRW(totalCommission)}</div>
              </CardContent>
            </Card>
          </div>

          {/* 거래 내역 테이블 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {selectedCp?.name} · {year}년 {month}월 ({rows.length}건)
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleExport}
                    disabled={rows.length === 0}
                  >
                    CSV 내보내기
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onExportToSheet}
                    disabled={sheetExporting || rows.length === 0}
                  >
                    {sheetExporting ? "내보내는 중…" : "시트로 내보내기"}
                  </Button>
                </div>
              </div>
              {sheetMsg && (
                <p className="mt-2 text-xs text-neutral-500">{sheetMsg}</p>
              )}
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
                        <th className="px-4 py-3 text-left">분류</th>
                        <th className="px-4 py-3 text-right">금액</th>
                        <th className="px-4 py-3 text-right">수수료</th>
                        <th className="px-4 py-3 text-center">결제</th>
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
                                r.type === "sale"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : r.type === "purchase"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {TYPE_KO[r.type] ?? r.type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-neutral-600">{r.category || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-neutral-900">
                            {formatKRW(r.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-neutral-600">
                            {r.commission_amount > 0 ? formatKRW(r.commission_amount) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {r.payment_status === "paid" ? (
                              <span className="text-xs font-medium text-emerald-600">완료</span>
                            ) : (
                              <span className="text-xs font-medium text-orange-600">대납</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-neutral-500">{r.memo || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 text-sm font-semibold">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-neutral-700">합계</td>
                        <td className="px-4 py-3 text-right text-neutral-900">{formatKRW(totalAmount)}</td>
                        <td className="px-4 py-3 text-right text-neutral-700">{formatKRW(totalCommission)}</td>
                        <td colSpan={2} className="px-4 py-3"></td>
                      </tr>
                    </tfoot>
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
