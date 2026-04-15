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
  const [draft, setDraft] = useState<DateRange | undefined>();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({ from: parse(startDate), to: parse(endDate) });
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, startDate, endDate]);

  function handleSelect(r: DateRange | undefined) {
    if (!r?.from) {
      setDraft(undefined);
      return;
    }
    if (r.from && r.to) {
      const from = r.from <= r.to ? r.from : r.to;
      const to = r.from <= r.to ? r.to : r.from;
      setDraft({ from, to });
      onChange(toDateStr(from), toDateStr(to));
      setOpen(false);
      return;
    }
    setDraft({ from: r.from, to: undefined });
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
        <div className="absolute right-0 top-10 z-30 w-max rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
          <DayPicker
            mode="range"
            selected={draft}
            onSelect={handleSelect}
            numberOfMonths={1}
            locale={ko}
            showOutsideDays
            weekStartsOn={0}
            captionLayout="dropdown"
            startMonth={new Date(2000, 0)}
            endMonth={new Date(2100, 11)}
          />
        </div>
      )}
    </div>
  );
}
