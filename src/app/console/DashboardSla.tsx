"use client";
// DASHBOARD · SLA/TAT KPIs — the headline turnaround numbers on the landing page.
// Shows the MAIN TATs (Import, Export, Check Package) as KPI tiles; click one to drill
// into its SUB-TATs — for Check Package the On-berth / Normal split, for Import/Export
// the median/p90 tail and the worst-offender ITVs. Same cycle records as the SLA tab.
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { SlaClass, SLA_CLASS_LABEL } from "@/lib/types";
import { flattenCycles, classStats, groupStats } from "@/lib/tat";

type MainKey = "import" | "export" | "check";
const MAINS: { key: MainKey; label: string; classes: SlaClass[] }[] = [
  { key: "import", label: "Import", classes: ["import"] },
  { key: "export", label: "Export", classes: ["export"] },
  { key: "check", label: "Check Package", classes: ["checkpkg_onberth", "checkpkg_normal"] },
];

const breachCls = (p: number) => (p >= 50 ? "text-[#C0392B]" : p >= 25 ? "text-[#9A6206]" : "text-[#177A47]");

export default function DashboardSla() {
  const { state } = useApp();
  const { slaConfig } = state;
  const [open, setOpen] = useState<MainKey | null>(null);

  const rows = useMemo(() => flattenCycles(state.driverLogs), [state.driverLogs]);
  const cls = useMemo(() => classStats(rows, slaConfig), [rows, slaConfig]);
  const byClass = useMemo(() => Object.fromEntries(cls.map((c) => [c.c, c])) as Record<SlaClass, (typeof cls)[number]>, [cls]);

  // aggregate a main TAT across its sub-classes
  const mainStat = (m: (typeof MAINS)[number]) => {
    const parts = m.classes.map((c) => byClass[c]).filter(Boolean);
    const n = parts.reduce((a, p) => a + p.n, 0);
    const breach = parts.reduce((a, p) => a + p.breach, 0);
    const avg = n ? Math.round(parts.reduce((a, p) => a + p.avg * p.n, 0) / n) : 0;
    const target = Math.max(...m.classes.map((c) => slaConfig[c].targetMin));
    return { n, breach, avg, target, breachPct: n ? Math.round((100 * breach) / n) : 0 };
  };

  const totalN = rows.length;

  return (
    <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">SLA · turnaround (TAT)</p>
        <span className="text-[10px] text-[#96A2B4]">tap a TAT for its sub-TATs · ▲ = over target</span>
      </div>

      {totalN === 0 ? (
        <p className="text-[12px] text-[#5C6B80] py-4 text-center border border-dashed border-[#D8DEE7] rounded-lg">
          No TAT cycles yet — load a transport report (⬆ Import) and the turnaround KPIs fill in here.
        </p>
      ) : (
        <>
          {/* MAIN TATs — click a tile to drill into its sub-TATs */}
          <div className="grid grid-cols-3 gap-2.5">
            {MAINS.map((m) => {
              const s = mainStat(m);
              const on = open === m.key;
              const hit = s.n > 0 && s.avg <= s.target;
              return (
                <button
                  key={m.key}
                  onClick={() => setOpen(on ? null : m.key)}
                  className={`text-left rounded-xl border-2 p-3 transition-colors ${on ? "border-[#1F3864] bg-[#F2F5FA]" : s.breachPct >= 50 ? "border-[#F2C7C1] bg-[#FDF6F5]" : "border-[#EDF0F5] bg-white hover:border-[#CBD5E6]"}`}
                >
                  <p className="text-[11.5px] font-extrabold text-[#16243A] flex items-center justify-between">{m.label}<span className="text-[9px] text-[#96A2B4] font-bold">{on ? "▲" : "▼"}</span></p>
                  <p className="text-[10px] text-[#5C6B80] mt-0.5">target {s.target}m</p>
                  {s.n === 0 ? (
                    <p className="text-[12px] text-[#96A2B4] mt-1 py-1">no cycles</p>
                  ) : (
                    <>
                      <p className={`text-[24px] font-extrabold tabular-nums leading-tight mt-0.5 ${hit ? "text-[#177A47]" : "text-[#C0392B]"}`}>{hit ? "" : "▲"}{s.avg}<span className="text-[9px] font-semibold text-[#5C6B80] ml-1">avg min</span></p>
                      <p className="text-[11px] font-bold"><span className={breachCls(s.breachPct)}>{s.breachPct}% breach</span> <span className="text-[#96A2B4] font-medium">· {s.n}</span></p>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* SUB-TATs — the drill-down for the opened main TAT */}
          {open && (
            <SubTats mainKey={open} rows={rows} byClass={byClass} slaConfig={slaConfig} />
          )}
        </>
      )}
    </div>
  );
}

function SubTats({ mainKey, rows, byClass, slaConfig }: { mainKey: MainKey; rows: ReturnType<typeof flattenCycles>; byClass: Record<SlaClass, ReturnType<typeof classStats>[number]>; slaConfig: import("@/lib/types").SlaConfig }) {
  const main = MAINS.find((m) => m.key === mainKey)!;

  // check package → its two sub-classes as tiles; import/export → tail + worst ITVs
  if (mainKey === "check") {
    return (
      <div className="mt-3 border-t border-[#EDF0F5] pt-3">
        <p className="text-[10px] uppercase tracking-[0.06em] text-[#5C6B80] font-bold mb-2">Sub-TATs · {main.label}</p>
        <div className="grid grid-cols-2 gap-2.5">
          {main.classes.map((c) => {
            const s = byClass[c];
            const hit = s.n > 0 && s.avg <= s.target.targetMin;
            return (
              <div key={c} className="rounded-lg border border-[#EDF0F5] p-2.5">
                <p className="text-[11px] font-bold text-[#16243A]">{SLA_CLASS_LABEL[c].replace("Check pkg · ", "")}</p>
                <p className="text-[9.5px] text-[#5C6B80]">target {s.target.targetMin}m · {s.target.priority}</p>
                {s.n === 0 ? <p className="text-[12px] text-[#96A2B4] mt-1">no cycles yet</p> : (
                  <p className="mt-0.5"><span className={`text-[19px] font-extrabold tabular-nums ${hit ? "text-[#177A47]" : "text-[#C0392B]"}`}>{s.avg}m</span> <span className={`text-[11px] font-bold ${breachCls(s.breachPct)}`}>{s.breachPct}% breach</span> <span className="text-[10px] text-[#96A2B4]">· {s.n}</span></p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // import / export → the tail (median/p90) + the worst ITVs for this class
  const c = main.classes[0];
  const s = byClass[c];
  const classRows = rows.filter((r) => r.c === c);
  const worst = groupStats(classRows, slaConfig, "itv").filter((g) => g.n >= 2).sort((a, b) => b.breachPct - a.breachPct).slice(0, 5);
  return (
    <div className="mt-3 border-t border-[#EDF0F5] pt-3">
      <p className="text-[10px] uppercase tracking-[0.06em] text-[#5C6B80] font-bold mb-2">Sub-TATs · {main.label}</p>
      <div className="flex gap-4 text-[12px] mb-2">
        <span className="text-[#5C6B80]">median <b className="text-[#16243A]">{s.median}m</b></span>
        <span className="text-[#5C6B80]">p90 <b className="text-[#16243A]">{s.p90}m</b></span>
        <span className="text-[#5C6B80]">breached <b className={breachCls(s.breachPct)}>{s.breach}/{s.n}</b></span>
      </div>
      {worst.length > 0 ? (
        <>
          <p className="text-[10px] text-[#5C6B80] font-semibold mb-1">Worst ITVs</p>
          <div className="flex flex-wrap gap-1.5">
            {worst.map((g) => (
              <span key={g.key} className="text-[11px] font-semibold border border-[#EDF0F5] rounded-full px-2 py-0.5">
                <b className="font-mono">{g.key}</b> <span className={breachCls(g.breachPct)}>{g.avg}m · {g.breachPct}%</span>
              </span>
            ))}
          </div>
        </>
      ) : <p className="text-[11px] text-[#96A2B4]">not enough cycles per ITV yet</p>}
    </div>
  );
}
