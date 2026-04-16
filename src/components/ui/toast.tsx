import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "error" | "success" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "error") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    const timer = setTimeout(() => dismiss(id), 3500);
    timers.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg text-sm max-w-sm pointer-events-auto animate-in fade-in slide-in-from-bottom-2",
              t.variant === "error" && "bg-red-50 border-red-200 text-red-800",
              t.variant === "success" && "bg-emerald-50 border-emerald-200 text-emerald-800",
              t.variant === "info" && "bg-neutral-50 border-neutral-200 text-neutral-800",
            )}
          >
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-current opacity-50 hover:opacity-100 leading-none mt-0.5"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}
