import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKRW(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const n = Math.abs(Math.trunc(amount));
  return `${sign}${n.toLocaleString("ko-KR")}원`;
}

export function formatDate(value: string | Date): string {
  if (typeof value === "string") {
    // YYYY-MM-DD 형식은 UTC 파싱 없이 그대로 반환 (타임존 오프셋 방지)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (Number.isNaN(value.getTime())) return String(value);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return formatDate(new Date());
}

export function uuid(prefix = "id"): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}
