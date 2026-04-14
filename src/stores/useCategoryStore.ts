import { create } from "zustand";
import type { Category } from "@/types";
import * as db from "@/lib/db";

interface CategoryState {
  categories: Category[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set) => ({
  categories: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      const categories = await db.listCategories();
      set({ categories, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "분류를 불러오지 못했습니다." });
    }
  },
}));
