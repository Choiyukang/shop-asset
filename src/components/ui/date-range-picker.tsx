import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";

interface Props {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function DateRangePicker({ startDate, endDate, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const range: DateRange = { from: parse(startDate), to: parse(endDate) };

  function handleSelect(r: DateRange | undefined) {
    if (!r?.from) return;
    const from = r.from;
    const to = r.to ?? r.from;
    onChange(toDateStr(from), toDateStr(to));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-700 hover:bg-neutral-50 focus:border-neutral-500 focus:outline-none"
      >
        {startDate} ~ {endDate}
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-30 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            numberOfMonths={2}
            locale={ko}
            showOutsideDays
          />
        </div>
      )}
    </div>
  );
}
