import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface ComboboxProps {
  value: string;
  options: ComboboxOption[];
  onChange: (value: string, selected?: ComboboxOption) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}

export function Combobox({ value, options, onChange, placeholder, className, maxLength }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    onChange(v, undefined);
    setOpen(true);
  }

  function handleSelect(opt: ComboboxOption) {
    setQuery(opt.label);
    onChange(opt.label, opt);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={cn(
          "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400",
          className,
        )}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg">
          {filtered.map((opt) => (
            <li
              key={opt.id}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click
                handleSelect(opt);
              }}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-neutral-100"
            >
              <span>{opt.label}</span>
              {opt.sublabel && (
                <span className="ml-2 text-xs text-neutral-400">{opt.sublabel}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
