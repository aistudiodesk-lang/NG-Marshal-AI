// ── TAT ENGINE — the SLA spine ────────────────────────────────────────────────
// Pure functions. Every SLA screen is a lens on the same cycle records: flatten the
// trip logs' `cycles` into rows, then roll them up by class, or by any dimension
// (ITV / vendor / driver / date). Breach is computed live against the editable
// SlaConfig, so changing a target re-judges history without re-importing.
import { DriverTripLog, SlaClass, SlaConfig, SlaTarget, SLA_CLASS_ORDER } from "./types";

/** One measured cycle, with the context needed to group it. */
export interface CycleRow {
  c: SlaClass;
  m: number;      // turnaround minutes
  itv: string;
  vendor: string;
  driver: string;
  date: string;
}

/** Explode the trip logs into one row per completed cycle. */
export function flattenCycles(logs: DriverTripLog[]): CycleRow[] {
  const out: CycleRow[] = [];
  for (const l of logs) {
    if (!l.cycles) continue;
    for (const cy of l.cycles) {
      out.push({ c: cy.c, m: cy.m, itv: l.itv || "—", vendor: l.vendor || "—", driver: l.driverName || "—", date: l.date });
    }
  }
  return out;
}

const mean = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
/** Nearest-rank percentile on an already-sorted ascending array. */
const percentile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

export interface ClassStat {
  c: SlaClass;
  target: SlaTarget;
  n: number;         // cycles measured
  avg: number;       // average TAT (min)
  median: number;
  p90: number;       // 90th percentile — the tail that hurts SLA
  within: number;    // count within target
  breach: number;    // count over target
  breachPct: number; // % breached
}

/** Per-class TAT vs target across the given rows. Always returns all four classes. */
export function classStats(rows: CycleRow[], cfg: SlaConfig): ClassStat[] {
  return SLA_CLASS_ORDER.map((c) => {
    const target = cfg[c];
    const ms = rows.filter((r) => r.c === c).map((r) => r.m).sort((a, b) => a - b);
    const n = ms.length;
    const breach = ms.filter((m) => m > target.targetMin).length;
    return {
      c, target, n,
      avg: mean(ms),
      median: Math.round(percentile(ms, 0.5)),
      p90: Math.round(percentile(ms, 0.9)),
      within: n - breach,
      breach,
      breachPct: n ? Math.round((100 * breach) / n) : 0,
    };
  });
}

export interface GroupStat {
  key: string;
  n: number;
  avg: number;
  breach: number;
  breachPct: number;
  byClass: Partial<Record<SlaClass, { n: number; avg: number; breachPct: number }>>;
}

/** Roll cycles up by a dimension (ITV / vendor / driver / date) for the breach tables. */
export function groupStats(rows: CycleRow[], cfg: SlaConfig, dim: "itv" | "vendor" | "driver" | "date"): GroupStat[] {
  const buckets = new Map<string, CycleRow[]>();
  for (const r of rows) {
    const k = r[dim];
    const b = buckets.get(k);
    if (b) b.push(r); else buckets.set(k, [r]);
  }
  return [...buckets.entries()].map(([key, rs]) => {
    const ms = rs.map((r) => r.m);
    const breach = rs.filter((r) => r.m > cfg[r.c].targetMin).length;
    const byClass: GroupStat["byClass"] = {};
    for (const c of SLA_CLASS_ORDER) {
      const cs = rs.filter((r) => r.c === c);
      if (!cs.length) continue;
      byClass[c] = {
        n: cs.length,
        avg: mean(cs.map((r) => r.m)),
        breachPct: Math.round((100 * cs.filter((r) => r.m > cfg[c].targetMin).length) / cs.length),
      };
    }
    return { key, n: rs.length, avg: mean(ms), breach, breachPct: rs.length ? Math.round((100 * breach) / rs.length) : 0, byClass };
  });
}

/** Grand totals across all classes — for the headline tiles. */
export function overall(stats: ClassStat[]): { n: number; breach: number; breachPct: number } {
  const n = stats.reduce((a, s) => a + s.n, 0);
  const breach = stats.reduce((a, s) => a + s.breach, 0);
  return { n, breach, breachPct: n ? Math.round((100 * breach) / n) : 0 };
}
