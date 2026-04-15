import { create } from "zustand";
import type { TaxType, Transaction, TransactionInput } from "@/types";
import * as db from "@/lib/db";

interface TransactionState {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (input: TransactionInput, taxType: TaxType) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      const transactions = await db.listTransactions();
      set({ transactions, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "거래 목록을 불러오지 못했습니다." });
    }
  },
  async add(input, taxType) {
    try {
      await db.createTransaction(input, taxType);
      await get().load();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "거래 저장에 실패했습니다." });
      throw e;
    }
  },
  async remove(id) {
    try {
      await db.deleteTransaction(id);
      await get().load();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "거래 삭제에 실패했습니다." });
      throw e;
    }
  },
}));
