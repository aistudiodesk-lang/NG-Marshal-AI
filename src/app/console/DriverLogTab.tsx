"use client";
// DRIVER LOG — the day-to-day record we can start capturing NOW, before auto-allocation
// is live. Per driver, per day: how many import / export / scanning moves (20' & 40')
// and check-package. Enter by hand here, or upload a daily file (⬆ Import → Daily logs →
// Driver trip log). TEU is worked out automatically (20' = 1, 40' = 2).
//
// Sources are tracked (manual / upload / system / app) so a reconciliation view can
// layer on later — the same idea as the ITV mark-live reconcile.
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { DriverTripLog, logTeu, logTrips } from "@/lib/types";

const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

type CountKey = "imp20" | "imp40" | "exp20" | "exp40" | "scan20" | "scan40" | "checkPkg";
const COUNT_COLS: { key: CountKey; label: string; group: string }[] = [
  { key: "imp20", label: "20'", group: "Import" },
  { key: "imp40", label: "40'", group: "Import" },
  { key: "exp20", label: "20'", group: "Export" },
  { key: "exp40", label: "40'", group: "Export" },
  { key: "scan20", label: "20'", group: "Scanning" },
  { key: "scan40", label: "40'", group: "Scanning" },
  { key: "checkPkg", label: "—", group: "Check pkg" },
];

export default function DriverLogTab() {
  const { state, dispatch } = useApp();
  const [date, setDate] = useState(todayStr());
  const [driverName, setDriverName] = useState("");
  const [itv, setItv] = useState("");
  const [counts, setCounts] = useState<Record<CountKey, string>>({ imp20: "", imp40: "", exp20: "", exp40: "", scan20: "", scan40: "", checkPkg: "" });
  const [remarks, setRemarks] = useState("");

  const n = (v: string) => Math.max(0, parseInt(v || "0", 10) || 0);
  const draft: DriverTripLog = { id: 0, date, driverName, itv: itv || undefined, imp20: n(counts.imp20), imp40: n(counts.imp40), exp20: n(counts.exp20), exp40: n(counts.exp40), scan20: n(counts.scan20), scan40: n(counts.scan40), checkPkg: n(counts.checkPkg), source: "manual", at: 0 };
  const draftTrips = logTrips(draft), draftTeu = logTeu(draft);

  const save = () => {
    if (!driverName.trim() && !itv.trim()) return;
    if (draftTrips === 0) return;
    dispatch({ type: "addDriverLog", log: { date, driverName: driverName.trim(), itv: itv.trim().toUpperCase() || undefined, imp20: draft.imp20, imp40: draft.imp40, exp20: draft.exp20, exp40: draft.exp40, scan20: draft.scan20, scan40: draft.scan40, checkPkg: draft.checkPkg, remarks: remarks.trim() || undefined } });
    setDriverName(""); setItv(""); setRemarks("");
    setCounts({ imp20: "", imp40: "", exp20: "", exp40: "", scan20: "", scan40: "", checkPkg: "" });
  };

  // filter + summary
  const [dayFilter, setDayFilter] = useState<string>("all");
  const dates = useMemo(() => [...new Set(state.driverLogs.map((l) => l.date))].sort().reverse(), [state.driverLogs]);
  const rows = state.driverLogs.filter((l) => dayFilter === "all" || l.date === dayFilter);

  // per-driver rollup for the filtered range
  const perDriver = useMemo(() => {
    const m = new Map<string, { name: string; itvs: Set<string>; vendor?: string; trips: number; teu: number; imp: number; exp: number; scan: number; cp: number }>();
    rows.forEach((l) => {
      const key = l.driverId || l.driverName || l.itv || "—";
      if (!m.has(key)) m.set(key, { name: l.driverName || `ITV ${l.itv}`, itvs: new Set(), vendor: l.vendor, trips: 0, teu: 0, imp: 0, exp: 0, scan: 0, cp: 0 });
      const g = m.get(key)!;
      if (l.itv) g.itvs.add(l.itv);
      g.trips += logTrips(l); g.teu += logTeu(l);
      g.imp += l.imp20 + 2 * l.imp40; g.exp += l.exp20 + 2 * l.exp40; g.scan += l.scan20 + 2 * l.scan40; g.cp += l.checkPkg;
    });
    return [...m.values()].sort((a, b) => b.teu - a.teu);
  }, [rows]);

  const totalTeu = perDriver.reduce((a, d) => a + d.teu, 0);
  const totalTrips = perDriver.reduce((a, d) => a + d.trips, 0);

  const exportCsv = () => {
    const head = ["Date", "Driver", "ITV", "Vendor", "Import 20", "Import 40", "Export 20", "Export 40", "Scanning 20", "Scanning 40", "Check Package", "Trips", "TEU", "Source", "Remarks"];
    const body = rows.map((l) => [l.date, l.driverName, l.itv ?? "", l.vendor ?? "", l.imp20, l.imp40, l.exp20, l.exp40, l.scan20, l.scan40, l.checkPkg, logTrips(l), logTeu(l), l.source, l.remarks ?? ""]);
    const csv = [head, ...body].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `driver_trips_${dayFilter === "all" ? "all" : dayFilter}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const groups = ["Import", "Export", "Scanning", "Check pkg"];

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* ── MANUAL ENTRY ── */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Log a driver&apos;s day</p>
            <p className="text-[12px] text-[#5C6B80] mt-0.5">Type the moves, or upload a whole day at once with <b>⬆ Import → Driver trip log</b>. TEU is worked out automatically (20&apos;=1, 40&apos;=2).</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="Date">
            <input value={date} onChange={(e) => setDate(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2.5 py-1.5 text-[12.5px] w-28" />
          </Field>
          <Field label="Driver">
            <input list="driverlist" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="name" className="border border-[#D8DEE7] rounded-md px-2.5 py-1.5 text-[12.5px] w-40" />
            <datalist id="driverlist">{state.drivers.map((d) => <option key={d.id} value={d.name} />)}</datalist>
          </Field>
          <Field label="ITV">
            <input list="itvlist" value={itv} onChange={(e) => setItv(e.target.value.toUpperCase())} placeholder="A333" className="border border-[#D8DEE7] rounded-md px-2.5 py-1.5 text-[12.5px] w-24 font-mono" />
            <datalist id="itvlist">{state.vehicles.map((v) => <option key={v.id} value={v.id} />)}</datalist>
          </Field>
          {groups.map((g) => (
            <div key={g} className="border border-[#EDF0F5] rounded-lg px-2 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#5C6B80] text-center mb-1">{g}</p>
              <div className="flex gap-1">
                {COUNT_COLS.filter((c) => c.group === g).map((c) => (
                  <label key={c.key} className="text-center">
                    <span className="block text-[9px] text-[#96A2B4] font-bold">{c.label}</span>
                    <input value={counts[c.key]} onChange={(e) => setCounts((p) => ({ ...p, [c.key]: e.target.value.replace(/[^0-9]/g, "") }))} className="border border-[#D8DEE7] rounded px-1 py-1 text-[13px] w-11 text-center tabular-nums" placeholder="0" />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Field label="Remarks">
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2.5 py-1.5 text-[12.5px] w-36" />
          </Field>
          <div className="ml-auto text-right">
            <p className="text-[11px] text-[#5C6B80]"><b className="text-[15px] text-[#16243A]">{draftTrips}</b> trips · <b className="text-[15px] text-[#16243A]">{draftTeu}</b> TEU</p>
            <button onClick={save} disabled={draftTrips === 0 || (!driverName.trim() && !itv.trim())} className="mt-1 bg-[#1E9E5A] text-white text-[13px] font-bold rounded-md px-5 py-2 disabled:opacity-40">Save row ▸</button>
          </div>
        </div>
      </div>

      {/* ── PER-DRIVER SUMMARY ── */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Driver-wise totals</p>
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 py-1 text-[12px] font-semibold">
              <option value="all">All dates</option>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#5C6B80]"><b>{totalTrips}</b> trips · <b>{totalTeu}</b> TEU · {perDriver.length} drivers</span>
            <button onClick={exportCsv} disabled={!rows.length} className="text-[11.5px] font-bold text-[#1F3864] border border-[#1F3864]/40 rounded px-2.5 py-1.5 disabled:opacity-40">⬇ Export</button>
          </div>
        </div>
        {!perDriver.length ? (
          <p className="text-[12.5px] text-[#5C6B80] py-6 text-center border border-dashed border-[#D8DEE7] rounded-lg">No trips logged yet. Add a row above, or upload a daily file with ⬆ Import → Driver trip log.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.07em] text-[#5C6B80]">
                  {["Driver", "ITV(s)", "Vendor", "Import", "Export", "Scanning", "Check pkg", "Trips", "TEU"].map((h) => <th key={h} className="text-left font-bold px-2 py-1.5 border-b border-[#D8DEE7]">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {perDriver.map((d, i) => (
                  <tr key={i} className="border-b border-[#EDF0F5]">
                    <td className="px-2 py-1.5 font-semibold">{d.name}</td>
                    <td className="px-2 py-1.5 font-mono text-[11px] text-[#5C6B80]">{[...d.itvs].join(", ") || "—"}</td>
                    <td className="px-2 py-1.5 text-[#5C6B80]">{d.vendor ?? "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{d.imp}</td>
                    <td className="px-2 py-1.5 tabular-nums">{d.exp}</td>
                    <td className="px-2 py-1.5 tabular-nums">{d.scan}</td>
                    <td className="px-2 py-1.5 tabular-nums">{d.cp}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold">{d.trips}</td>
                    <td className="px-2 py-1.5 tabular-nums font-extrabold text-[#16243A]">{d.teu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RAW ROWS (edit / delete) ── */}
      {rows.length > 0 && (
        <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
          <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-2">Logged rows <span className="font-medium normal-case tracking-normal">· newest first · remove a wrong entry</span></p>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[11.5px] whitespace-nowrap">
              <thead className="sticky top-0 bg-[#F6F8FB]">
                <tr className="text-[9.5px] uppercase tracking-[0.06em] text-[#5C6B80]">
                  {["Date", "Driver", "ITV", "I20", "I40", "E20", "E40", "S20", "S40", "CP", "TEU", "Src", ""].map((h) => <th key={h} className="text-left font-bold px-1.5 py-1 border-b border-[#D8DEE7]">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-[#EDF0F5]">
                    <td className="px-1.5 py-1 text-[#5C6B80]">{l.date}</td>
                    <td className="px-1.5 py-1 font-semibold">{l.driverName || <span className="text-[#96A2B4]">(from ITV)</span>}</td>
                    <td className="px-1.5 py-1 font-mono">{l.itv ?? "—"}</td>
                    <td className="px-1.5 py-1 tabular-nums">{l.imp20}</td><td className="px-1.5 py-1 tabular-nums">{l.imp40}</td>
                    <td className="px-1.5 py-1 tabular-nums">{l.exp20}</td><td className="px-1.5 py-1 tabular-nums">{l.exp40}</td>
                    <td className="px-1.5 py-1 tabular-nums">{l.scan20}</td><td className="px-1.5 py-1 tabular-nums">{l.scan40}</td>
                    <td className="px-1.5 py-1 tabular-nums">{l.checkPkg}</td>
                    <td className="px-1.5 py-1 tabular-nums font-bold">{logTeu(l)}</td>
                    <td className="px-1.5 py-1"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${l.source === "manual" ? "bg-[#EAF1FB] text-[#1F3864]" : "bg-[#FDF3E3] text-[#9A6206]"}`}>{l.source}</span></td>
                    <td className="px-1.5 py-1"><button onClick={() => dispatch({ type: "deleteDriverLog", id: l.id })} className="text-[#C0392B] font-bold">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#5C6B80]">{label}</span>
      {children}
    </label>
  );
}
