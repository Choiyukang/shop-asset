import { create } from "zustand";
import type { Counterparty, CounterpartyInput } from "@/types";
import * as db from "@/lib/db";

interface CounterpartyState {
  counterparties: Counterparty[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (input: CounterpartyInput) => Promise<void>;
}

export const useCounterpartyStore = create<CounterpartyState>((set, get) => ({
  counterparties: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      const counterparties = await db.listCounterparties();
      set({ counterparties, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "거래처를 불러오지 못했습니다." });
    }
  },
  async add(input) {
    try {
      await db.createCounterparty(input);
      await get().load();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "거래처 저장에 실패했습니다." });
      throw e;
    }
  },
}));
