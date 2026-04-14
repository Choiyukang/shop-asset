import { create } from "zustand";
import type { Product, ProductInput } from "@/types";
import * as db from "@/lib/db";

interface ProductState {
  products: Product[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (input: ProductInput) => Promise<void>;
  update: (id: string, patch: Partial<Omit<Product, "id" | "created_at">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      const products = await db.listProducts();
      set({ products, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "상품을 불러오지 못했습니다." });
    }
  },
  async add(input) {
    try {
      await db.createProduct(input);
      await get().load();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "상품 저장에 실패했습니다." });
      throw e;
    }
  },
  async update(id, patch) {
    try {
      await db.updateProduct(id, patch);
      await get().load();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "상품 수정에 실패했습니다." });
      throw e;
    }
  },
  async remove(id) {
    try {
      await db.deleteProduct(id);
      await get().load();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "상품 삭제에 실패했습니다. 거래에 사용된 상품일 수 있습니다." });
      throw e;
    }
  },
}));
