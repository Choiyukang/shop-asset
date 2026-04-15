import { NavLink } from "react-router-dom";
import { LayoutDashboard, Receipt, Users, Package, FileSpreadsheet, TrendingUp, ClipboardList, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "대시보드", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "거래 내역", icon: Receipt, end: false },
  { to: "/products", label: "상품", icon: Package, end: false },
  { to: "/counterparties", label: "거래처", icon: Users, end: false },
  { to: "/tax", label: "부가세 신고", icon: FileSpreadsheet, end: false },
  { to: "/pnl", label: "월별 손익", icon: TrendingUp, end: false },
  { to: "/statement", label: "거래처 정산서", icon: ClipboardList, end: false },
  { to: "/settings", label: "설정", icon: Settings, end: false },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 py-5">
        <div className="text-lg font-bold tracking-tight">쇼핑몰 자산관리</div>
        <div className="text-xs text-neutral-500">MallBook · v{__APP_VERSION__}</div>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-700 hover:bg-neutral-100",
                )
              }
            >
              <Icon size={16} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="px-5 py-3 text-[11px] text-neutral-400">
        © {new Date().getFullYear()} MallBook
      </div>
    </aside>
  );
}
