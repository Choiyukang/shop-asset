import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parse(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function DatePicker({ value, onChange, placeholder = "날짜 선택" }: Props) {
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

  const selected = parse(value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-left text-sm text-neutral-700 hover:bg-neutral-50 focus:border-neutral-500 focus:outline-none"
      >
        {value || <span className="text-neutral-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-30 w-max rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(toDateStr(d));
                setOpen(false);
              }
            }}
            locale={ko}
            showOutsideDays
            captionLayout="dropdown"
            startMonth={new Date(2000, 0)}
            endMonth={new Date(2100, 11)}
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-2 w-full rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              선택 지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
