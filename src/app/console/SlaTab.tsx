"use client";
// SLA BREACH BOARD — the detail under the Dashboard's TAT KPIs. Same cycle records
// and engine; here you see WHO is missing the mark: breach rate rolled up by ITV /
// vendor / driver / date, sortable, with a CSV export. Rendered on the Dashboard
// (there is no separate SLA tab — turnaround lives on the dashboard).
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { SLA_CLASS_ORDER, SLA_CLASS_LABEL, SlaClass } from "@/lib/types";
import { flattenCycles, classStats, groupStats, overall } from "@/lib/tat";

type Dim = "itv" | "vendor" | "driver" | "date";
type SortKey = "key" | "n" | "avg" | "breachPct";

const DIMS: { k: Dim; label: string }[] = [
  { k: "itv", label: "By ITV" },
  { k: "vendor", label: "By vendor" },
  { k: "driver", label: "By driver" },
  { k: "date", label: "By date" },
];

const breachCls = (p: number) => (p >= 50 ? "text-[#C0392B]" : p >= 25 ? "text-[#9A6206]" : "text-[#177A47]");

export default function SlaBoard() {
  const { state } = useApp();
  const { slaConfig } = state;
  const [dayFilter, setDayFilter] = useState("all");
  const [dim, setDim] = useState<Dim>("itv");
  const [sortKey, setSortKey] = useState<SortKey>("breachPct");
  const [dir, setDir] = useState<1 | -1>(-1);

  const dates = useMemo(() => [...new Set(state.driverLogs.map((l) => l.date))].sort().reverse(), [state.driverLogs]);

  const rows = useMemo(() => {
    const logs = state.driverLogs.filter((l) => dayFilter === "all" || l.date === dayFilter);
    return flattenCycles(logs);
  }, [state.driverLogs, dayFilter]);

  const tot = useMemo(() => overall(classStats(rows, slaConfig)), [rows, slaConfig]);

  const groups = useMemo(() => {
    const g = groupStats(rows, slaConfig, dim);
    const val = (r: (typeof g)[number]) => (sortKey === "key" ? r.key : r[sortKey]);
    g.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "string") return dir * (av as string).localeCompare(bv as string);
      return dir * ((av as number) - (bv as number));
    });
    return g;
  }, [rows, slaConfig, dim, sortKey, dir]);

  const setSort = (k: SortKey) => { if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setDir(k === "key" ? 1 : -1); } };
  const arrow = (k: SortKey) => (sortKey === k ? (dir === 1 ? " ▲" : " ▼") : "");

  const exportCsv = () => {
    const classCols = SLA_CLASS_ORDER;
    const head = [dim, "Cycles", "Avg TAT min", "Breach %", ...classCols.flatMap((c) => [`${SLA_CLASS_LABEL[c]} n`, `${SLA_CLASS_LABEL[c]} avg`, `${SLA_CLASS_LABEL[c]} breach%`])];
    const body = groups.map((r) => [r.key, r.n, r.avg, r.breachPct, ...classCols.flatMap((c) => [r.byClass[c]?.n ?? "", r.byClass[c]?.avg ?? "", r.byClass[c]?.breachPct ?? ""])]);
    const csv = [head, ...body].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `sla_tat_${dim}_${dayFilter === "all" ? "all" : dayFilter}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th onClick={() => setSort(k)} className={`font-bold px-2 py-1.5 border-b border-[#D8DEE7] cursor-pointer select-none hover:text-[#1F3864] ${right ? "text-right" : "text-left"}`}>{label}{arrow(k)}</th>
  );

  // no cycles → the Dashboard KPI card already shows the "load a transport report" prompt
  if (tot.n === 0) return null;

  return (
    <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mr-1">Who&apos;s missing SLA</p>
        <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 py-1 text-[12px] font-semibold">
          <option value="all">All dates</option>
          {dates.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="flex rounded-md border border-[#D8DEE7] overflow-hidden">
          {DIMS.map((d) => (
            <button key={d.k} onClick={() => setDim(d.k)} className={`text-[11.5px] font-bold px-2.5 py-1.5 ${dim === d.k ? "bg-[#1F3864] text-white" : "bg-white text-[#5C6B80]"}`}>{d.label}</button>
          ))}
        </div>
        <span className="text-[11.5px] text-[#5C6B80] ml-auto">{tot.n.toLocaleString("en-IN")} cycles · <b className={breachCls(tot.breachPct)}>{tot.breachPct}%</b> breached · click a column to sort</span>
        <button onClick={exportCsv} className="text-[11.5px] font-bold text-[#1F3864] border border-[#1F3864]/40 rounded px-2.5 py-1.5">⬇ SLA report</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.06em] text-[#5C6B80]">
              <Th k="key" label={dim === "itv" ? "ITV" : dim === "vendor" ? "Vendor" : dim === "driver" ? "Driver" : "Date"} />
              <Th k="n" label="Cycles" right />
              <Th k="avg" label="Avg TAT" right />
              <Th k="breachPct" label="Breach %" right />
              {SLA_CLASS_ORDER.map((c) => (
                <th key={c} className="text-right font-bold px-2 py-1.5 border-b border-[#D8DEE7]">{SLA_CLASS_LABEL[c].replace("Check pkg · ", "Chk ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((r) => (
              <tr key={r.key} className="border-b border-[#EDF0F5]">
                <td className="px-2 py-1.5 font-semibold font-mono">{r.key}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.n}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{r.avg}m</td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${breachCls(r.breachPct)}`}>{r.breachPct}%</td>
                {SLA_CLASS_ORDER.map((c) => {
                  const b = r.byClass[c as SlaClass];
                  return (
                    <td key={c} className="px-2 py-1.5 text-right tabular-nums text-[#5C6B80]">
                      {b ? <span><b className={b.avg <= slaConfig[c].targetMin ? "text-[#177A47]" : "text-[#C0392B]"}>{b.avg}m</b> <span className="text-[10px] text-[#96A2B4]">·{b.n}</span></span> : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-[#5C6B80] mt-2">Per-class cells show <b>avg TAT</b> (green ≤ target, red over) <span className="text-[#96A2B4]">·N</span> = cycles measured. Breach % is against each cycle&apos;s own class target. Sort to find the worst offenders.</p>
    </div>
  );
}
