// Revenue rule (per the operator): a driver earns on GATE-IN passes only
// (import gate-in + export gate-in) — not drop-off/gate-out slips, so a cycle isn't
// counted multiple times. Amount depends on container size, read from the FIRST digit
// of the Size/Type/ISO code: starts with 2 → 20ft → ₹60, starts with 4 → 40ft → ₹90.
// (The rest of the ISO code varies — 2210, 4410, 441E … — only the first digit matters.)

export interface RevenueResult {
  sizeFt: 20 | 40 | null;
  revenue: number;
  eligible: boolean; // is this one of the paying parchi types?
}

const RATE: Record<number, number> = { 20: 60, 40: 90 };

/** 20 or 40 ft from the ISO/size code's first digit; null if unreadable. */
export function sizeFromIso(iso?: string | null): 20 | 40 | null {
  const c = (iso || "").trim().charAt(0);
  return c === "4" ? 40 : c === "2" ? 20 : null;
}

/** GATE-IN passes are the paying parchis (import gate-in + export gate-in). */
export function isRevenueParchi(parchiType?: string | null): boolean {
  return /GATE\s*IN/.test((parchiType || "").toUpperCase());
}

export function computeRevenue(parchiType?: string | null, isoCode?: string | null): RevenueResult {
  const eligible = isRevenueParchi(parchiType);
  const sizeFt = sizeFromIso(isoCode);
  const revenue = eligible && sizeFt ? RATE[sizeFt] : 0;
  return { sizeFt, revenue, eligible };
}
