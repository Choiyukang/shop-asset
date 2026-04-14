import type { TaxType } from "@/types";

export interface VatSplit {
  supply_amount: number;
  vat_amount: number;
}

/**
 * 부가세 자동 분리.
 * 일반과세자: amount = supply + vat (vat율 10%). supply = round(amount / 1.1), vat = amount - supply.
 * 간이과세자: 부가세를 별도 분리하지 않음(간이과세는 공급대가 방식). vat=0, supply=amount.
 *
 * 모든 금액은 정수 원(KRW). Float 사용 금지.
 */
export function splitVat(amount: number, taxType: TaxType): VatSplit {
  const amt = Math.trunc(amount);
  if (taxType === "간이과세자") {
    return { supply_amount: amt, vat_amount: 0 };
  }
  // 일반과세자 10%
  const supply = Math.round(amt / 1.1);
  const vat = amt - supply;
  return { supply_amount: supply, vat_amount: vat };
}
