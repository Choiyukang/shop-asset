import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/toast";

export function AppLayout() {
  return (
    <ToastProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-neutral-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-6">
            <div className="text-sm font-medium text-neutral-700">쇼핑몰 자산관리</div>
            <div className="text-xs text-neutral-500">
              {new Date().toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
