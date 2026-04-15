import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { CounterpartiesPage } from "@/pages/CounterpartiesPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { TaxReportPage } from "@/pages/TaxReportPage";
import { SettingsPage } from "@/pages/SettingsPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "transactions", element: <TransactionsPage /> },
      { path: "products", element: <ProductsPage /> },
      { path: "counterparties", element: <CounterpartiesPage /> },
      { path: "tax", element: <TaxReportPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

function App() {
  useEffect(() => {
    // DB 초기화 완료 후 저장된 봇 토큰이 있으면 봇 자동 시작
    const timer = setTimeout(() => {
      invoke("bot_start_if_configured").catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
