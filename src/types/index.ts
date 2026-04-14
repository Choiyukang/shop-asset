export type TaxType = "일반과세자" | "간이과세자";

export type TransactionType = "purchase" | "sale" | "expense";
export type PaymentStatus = "paid" | "pending";
export type CounterpartyType = "supplier" | "customer" | "personal";
export type CashflowDirection = "incoming" | "outgoing";
export type CashflowStatus = "pending" | "completed" | "overdue";

export interface User {
  id: string;
  name: string;
  business_number: string | null;
  tax_type: TaxType;
  google_email: string | null;
  google_sheet_url: string | null;
  created_at: string;
}

export interface Counterparty {
  id: string;
  name: string;
  type: CounterpartyType;
  phone: string | null;
  business_number: string | null;
  memo: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  tax_deductible: boolean;
  default_tax_rate: number;
}

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  amount: number;
  counterparty_id: string | null;
  category_id: string;
  memo: string | null;
  payment_status: PaymentStatus;
  synced_to_sheet: boolean;
  created_at: string;
}

export interface TaxRecord {
  id: string;
  transaction_id: string;
  supply_amount: number;
  vat_amount: number;
  is_refundable: boolean;
  tax_invoice_issued: boolean;
}

export interface CashflowItem {
  id: string;
  transaction_id: string;
  expected_date: string;
  amount: number;
  direction: CashflowDirection;
  status: CashflowStatus;
}

export interface TransactionInput {
  date: string;
  type: TransactionType;
  amount: number;
  counterparty_id: string | null;
  category_id: string;
  memo: string | null;
  payment_status: PaymentStatus;
}

export interface CounterpartyInput {
  name: string;
  type: CounterpartyType;
  phone: string | null;
}

export interface DashboardSummary {
  sales: number;
  expense: number;
  netIncome: number;
  count: number;
}
