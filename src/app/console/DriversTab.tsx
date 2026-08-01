"use client";
// DRIVERS — the driver-wise incentive dashboard. Rolls up the trip logs (manual,
// uploaded, or from the transport report) into per-driver trips, TEU and ₹ incentive
// (from the rate card), for any date or the whole period. Sort by any column; export
// the detailed driver-wise incentive report.
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { logTrips, logTeu, logTeuByMovement, logIncentive, logActiveHrs } from "@/lib/types";

type Row = {
  driver: string; vendor: string; itvs: Set<string>;
  trips: number; teu: number; imp: number; exp: number; scan: number; cp: number; incentive: number; days: Set<string>;
  activeHrs: number; cycleSum: number; cycleDays: number; // for avg trip time
};
type SortKey = "driver" | "trips" | "teu" | "imp" | "exp" | "scan" | "incentive" | "cycle" | "active";

export default function DriversTab() {
  const { state } = useApp();
  const { rateCard, milestoneTeu } = state;
  const [dayFilter, setDayFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("incentive");
  const [dir, setDir] = useState<1 | -1>(-1);

  const dates = useMemo(() => [...new Set(state.driverLogs.map((l) => l.date))].sort().reverse(), [state.driverLogs]);
  const logs = state.driverLogs.filter((l) => dayFilter === "all" || l.date === dayFilter);

  const rows = useMemo(() => {
    const m = new Map<string, Row>();
    logs.forEach((l) => {
      const key = l.driverId || l.driverName || l.itv || "—";
      if (!m.has(key)) m.set(key, { driver: l.driverName || `(ITV ${l.itv})`, vendor: l.vendor ?? "—", itvs: new Set(), trips: 0, teu: 0, imp: 0, exp: 0, scan: 0, cp: 0, incentive: 0, days: new Set(), activeHrs: 0, cycleSum: 0, cycleDays: 0 });
      const g = m.get(key)!;
      const t = logTeuByMovement(l);
      if (l.itv) g.itvs.add(l.itv);
      g.days.add(l.date);
      g.trips += logTrips(l); g.teu += logTeu(l);
      g.imp += t.import; g.exp += t.export; g.scan += t.scanning; g.cp += t.check_package;
      g.incentive += logIncentive(l, rateCard, milestoneTeu);
      g.activeHrs += logActiveHrs(l);
      if (l.avgGapMin != null) { g.cycleSum += l.avgGapMin; g.cycleDays += 1; }
    });
    const arr = [...m.values()];
    const cyc = (r: Row) => (r.cycleDays ? r.cycleSum / r.cycleDays : 0);
    arr.sort((a, b) => {
      const v = (r: Row) => (sortKey === "driver" ? r.driver : sortKey === "cycle" ? cyc(r) : sortKey === "active" ? r.activeHrs : r[sortKey]);
      const av = v(a), bv = v(b);
      if (typeof av === "string") return dir * (av as string).localeCompare(bv as string);
      return dir * ((av as number) - (bv as number));
    });
    return arr;
  }, [logs, rateCard, milestoneTeu, sortKey, dir]);

  const tot = rows.reduce((a, r) => ({ trips: a.trips + r.trips, teu: a.teu + r.teu, incentive: a.incentive + r.incentive }), { trips: 0, teu: 0, incentive: 0 });
  const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

  const setSort = (k: SortKey) => { if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setDir(k === "driver" ? 1 : -1); } };
  const arrow = (k: SortKey) => (sortKey === k ? (dir === 1 ? " ▲" : " ▼") : "");

  const exportCsv = () => {
    const head = ["Driver", "Vendor", "ITV(s)", "Days", "Trips", "Import TEU", "Export TEU", "Scanning TEU", "Check pkg", "Total TEU", "Avg trip min", "Active hrs", "Incentive INR"];
    const body = rows.map((r) => [r.driver, r.vendor, [...r.itvs].join(" "), r.days.size, r.trips, r.imp, r.exp, r.scan, r.cp, r.teu, r.cycleDays ? Math.round(r.cycleSum / r.cycleDays) : "", r.activeHrs.toFixed(1), r.incentive]);
    const csv = [head, ...body].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `driver_incentive_${dayFilter === "all" ? "all" : dayFilter}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th onClick={() => setSort(k)} className={`font-bold px-2 py-1.5 border-b border-[#D8DEE7] cursor-pointer select-none hover:text-[#1F3864] ${right ? "text-right" : "text-left"}`}>{label}{arrow(k)}</th>
  );

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Driver-wise incentive</p>
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 py-1 text-[12px] font-semibold">
              <option value="all">All dates</option>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-[11px] text-[#5C6B80]">rate {rateCard.version} · click a column to sort</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#5C6B80]"><b>{rows.length}</b> drivers · <b>{tot.trips}</b> trips · <b>{tot.teu}</b> TEU · <b className="text-[#177A47]">{inr(tot.incentive)}</b></span>
            <button onClick={exportCsv} disabled={!rows.length} className="text-[11.5px] font-bold text-[#1F3864] border border-[#1F3864]/40 rounded px-2.5 py-1.5 disabled:opacity-40">⬇ Incentive report</button>
          </div>
        </div>

        {!rows.length ? (
          <p className="text-[12.5px] text-[#5C6B80] py-8 text-center border border-dashed border-[#D8DEE7] rounded-lg">
            No trips logged yet. Load a transport report or a driver trip log (⬆ Import → Daily logs), or type entries in the Trip Log tab — this dashboard fills from the same data.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.06em] text-[#5C6B80]">
                  <Th k="driver" label="Driver" />
                  <th className="text-left font-bold px-2 py-1.5 border-b border-[#D8DEE7]">Vendor</th>
                  <th className="text-left font-bold px-2 py-1.5 border-b border-[#D8DEE7]">ITV(s)</th>
                  <Th k="trips" label="Trips" right />
                  <Th k="imp" label="Import" right />
                  <Th k="exp" label="Export" right />
                  <Th k="scan" label="Scan" right />
                  <th className="text-right font-bold px-2 py-1.5 border-b border-[#D8DEE7]">Chk</th>
                  <Th k="teu" label="TEU" right />
                  <Th k="cycle" label="Avg trip" right />
                  <Th k="active" label="Active" right />
                  <Th k="incentive" label="Incentive ₹" right />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cycle = r.cycleDays ? Math.round(r.cycleSum / r.cycleDays) : 0;
                  return (
                  <tr key={i} className="border-b border-[#EDF0F5]">
                    <td className="px-2 py-1.5 font-semibold">{r.driver}</td>
                    <td className="px-2 py-1.5 text-[#5C6B80]">{r.vendor}</td>
                    <td className="px-2 py-1.5 font-mono text-[11px] text-[#5C6B80] max-w-40 truncate" title={[...r.itvs].join(", ")}>{[...r.itvs].join(", ") || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{r.trips}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.imp}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.exp}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.scan}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[#5C6B80]">{r.cp}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{r.teu}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${cycle > 0 && cycle >= 300 ? "text-[#C0392B] font-bold" : "text-[#5C6B80]"}`}>{cycle > 0 ? `${cycle}m` : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[#5C6B80]">{r.activeHrs > 0 ? `${r.activeHrs.toFixed(1)}h` : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-extrabold text-[#177A47]">{inr(r.incentive)}</td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#F6F8FB] font-bold">
                  <td className="px-2 py-1.5" colSpan={3}>Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{tot.trips}</td>
                  <td colSpan={4} />
                  <td className="px-2 py-1.5 text-right tabular-nums">{tot.teu}</td>
                  <td colSpan={2} />
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#177A47]">{inr(tot.incentive)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-[10.5px] text-[#5C6B80] mt-2">
          Incentive = TEU × rate (import {inr(rateCard.perTeu.import)} · export {inr(rateCard.perTeu.export)} · scanning {inr(rateCard.perTeu.scanning)} · check-pkg {inr(rateCard.perTeu.check_package)} per TEU) + {inr(rateCard.milestoneBonus)} on any day clearing {milestoneTeu} TEU. Edit rates in Setup.
          <br /><b>Avg trip</b> = average minutes between a truck&apos;s gate events (cycle-time proxy, from the transport report&apos;s timestamps); <span className="text-[#C0392B] font-bold">red ≥ 300 min</span> = slow/idle. <b>Active</b> = first-to-last move span. Precise gate-in→gate-out→road legs and live &quot;stuck now&quot; alerts come with the parchi scan / driver app.
        </p>
      </div>
    </div>
  );
}
