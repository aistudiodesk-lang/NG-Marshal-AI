"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Wordmark } from "@/components/Brand";

import Approvals from "./Approvals";
import { Approval, ManualEntry, Row, STATUS, cycleOf, istDT, manualAsRow, parseDay, parsePaste, parseSize } from "./shared";
import DayPicker, { useUploadDays } from "@/components/DayPicker";

// Office dashboard: Overview (trips per driver + parchi details, CSV) and Approvals
// (evaluator ticks each photo daily). Trip = APPROVED gate-in parchi (revenue_eligible
// + approval_status='approved'); pending gate-ins are shown separately.

const ymd = (d: Date) => d.toLocaleDateString("en-CA");
const shiftDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

type Show = "approved" | "trips" | "all" | "other";

export default function DashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [driver, setDriver] = useState("");
  const [show, setShow] = useState<Show>("approved");
  const [tab, setTab] = useState<"overview" | "approvals">("overview");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState<ManualEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");
  const marks = useUploadDays();

  // dates set after mount — a prerendered build date must never stick (see /parchis fix)
  useEffect(() => { const t = ymd(new Date()); setFrom(shiftDays(-6)); setTo(t); }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true); setErr("");
    const qs = new URLSearchParams({ from, to, ...(driver ? { driver } : {}) });
    fetch(`/api/dashboard?${qs}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "load failed"); return j; })
      .then((j) => { setRows(j.rows); setDrivers(j.drivers); })
      .catch((e) => { setErr(e.message); setRows([]); })
      .finally(() => setLoading(false));
    fetch(`/api/manual-entries?${qs}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setManual(j.entries ?? [])).catch(() => setManual([]));
  }, [from, to, driver]);

  // Trips shown = photos + manual entries that no photo has matched yet (a matched
  // entry is represented by its auto-approved photo, so nothing is counted twice).
  const allRows = useMemo(
    () => [...rows, ...manual.filter((m) => !m.matched_photo_id).map(manualAsRow)],
    [rows, manual]);

  const preset = (a: number, b: number) => { setFrom(shiftDays(a)); setTo(shiftDays(b)); };
  // optimistic: update rows now, revert on API failure
  const setApproval = async (ids: string[], status: Approval, by: string) => {
    const before = new Map(rows.filter((r) => ids.includes(r.id)).map((r) => [r.id, r]));
    const now = new Date().toISOString();
    setRows((rs) => rs.map((r) => (ids.includes(r.id)
      ? { ...r, approval_status: status, approved_by: status === "pending" ? null : by, approved_at: status === "pending" ? null : now } : r)));
    try {
      const res = await fetch("/api/parchis/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, status, by }) });
      if (!res.ok) throw new Error((await res.json()).error || "save failed");
      setErr("");
    } catch (e) {
      setRows((rs) => rs.map((r) => before.get(r.id) ?? r));
      setErr(`Approval not saved — ${e instanceof Error ? e.message : "error"}`);
    }
  };

  const thisMonth = () => { const d = new Date(); setFrom(ymd(new Date(d.getFullYear(), d.getMonth(), 1))); setTo(ymd(d)); };

  const approved = (r: Row) => r.approval_status === "approved";
  const trips = allRows.filter((r) => r.revenue_eligible && approved(r));
  const awaiting = rows.filter((r) => r.revenue_eligible && r.approval_status === "pending").length;
  const stats = {
    trips: trips.length,
    parchis: rows.length, // photos only — a manual entry has no parchi
    drivers: new Set(trips.map((r) => r.driver_id)).size,
    ft20: trips.filter((r) => r.size_ft === 20).length,
    ft40: trips.filter((r) => r.size_ft === 40).length,
    imp: trips.filter((r) => cycleOf(r) === "IMPORT").length,
    exp: trips.filter((r) => cycleOf(r) === "EXPORT").length,
    revenue: trips.reduce((a, r) => a + (r.revenue || 0), 0),
    unread: rows.filter((r) => !r.ocr_at).length,
  };

  const perDriver = useMemo(() => {
    const m = new Map<string, { id: string; name: string; trips: number; pending: number; parchis: number; ft20: number; ft40: number; imp: number; exp: number; revenue: number; days: Set<string> }>();
    for (const r of allRows) {
      if (!m.has(r.driver_id)) m.set(r.driver_id, { id: r.driver_id, name: r.driver_name, trips: 0, pending: 0, parchis: 0, ft20: 0, ft40: 0, imp: 0, exp: 0, revenue: 0, days: new Set() });
      const g = m.get(r.driver_id)!;
      if (!r.manualId) g.parchis++;
      if (!r.revenue_eligible) continue;
      if (r.approval_status === "pending") g.pending++;
      if (!approved(r)) continue;
      g.revenue += r.revenue || 0;
      g.trips++;
      g.days.add(new Date(r.captured_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
      if (r.size_ft === 20) g.ft20++;
      if (r.size_ft === 40) g.ft40++;
      if (cycleOf(r) === "IMPORT") g.imp++;
      if (cycleOf(r) === "EXPORT") g.exp++;
    }
    return [...m.values()].sort((a, b) => b.trips - a.trips || b.parchis - a.parchis);
  }, [allRows]);

  const detail = useMemo(() => {
    const s = search.trim().toUpperCase();
    return allRows.filter((r) =>
      (show === "all" || (show === "approved" ? r.revenue_eligible && approved(r) : show === "trips" ? r.revenue_eligible : !r.revenue_eligible)) &&
      (!s || [r.container_no, r.vehicle_no, r.gate_pass_no, r.seal_no, r.transporter].some((v) => (v || "").toUpperCase().includes(s))));
  }, [allRows, show, search]);

  const COLS: [string, (r: Row) => string | number][] = [
    ["Date/Time", (r) => istDT(r.captured_at)],
    ["Driver", (r) => r.driver_name],
    ["Source", (r) => (r.manualId ? "✍ manual" : "📷 photo")],
    ["Type", (r) => r.parchi_type || (r.ocr_at ? "—" : "OCR pending")],
    ["Cycle", (r) => cycleOf(r)],
    ["Container", (r) => r.container_no || ""],
    ["Valid", (r) => (r.container_valid == null ? "" : r.container_valid ? "✓" : "⚠")],
    ["ISO", (r) => r.iso_code || ""],
    ["Size", (r) => (r.size_ft ? `${r.size_ft}ft` : "")],
    ["Gate pass", (r) => r.gate_pass_no || ""],
    ["Vehicle", (r) => r.vehicle_no || ""],
    ["Seal", (r) => r.seal_no || ""],
    ["Transporter", (r) => r.transporter || ""],
    ["Doc date", (r) => r.doc_datetime || ""],
    ["₹", (r) => r.revenue ?? 0],
    ["Status", (r) => `${STATUS[r.approval_status].icon} ${STATUS[r.approval_status].label}${r.approved_by ? " · " + r.approved_by : ""}`],
  ];

  // Grid saved a batch. Each entry may have auto-approved a matching photo (cross-check runs in the API).
  const onManualSaved = (entries: ManualEntry[], by: string) => {
    setManual((m) => [...entries, ...m]);
    const hit = new Set(entries.map((e) => e.matched_photo_id).filter(Boolean));
    if (hit.size) {
      const at = new Date().toISOString();
      setRows((rs) => rs.map((r) => (hit.has(r.id)
        ? { ...r, approval_status: "approved" as Approval, approved_by: `auto · ${by}`, approved_at: at } : r)));
    }
    setNote(`✍ ${entries.length} manual entries saved · ${hit.size} मिलती पर्ची अपने-आप approve हुई (auto-approved)`);
    setTimeout(() => setNote(""), 8000);
  };

  const deleteManual = async (id: string) => {
    setManual((m) => m.filter((x) => x.id !== id));
    await fetch(`/api/manual-entries?id=${id}`, { method: "DELETE" }).catch(() => {});
  };

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [COLS.map(([h]) => esc(h)).join(","), ...detail.map((r) => COLS.map(([, f]) => esc(f(r))).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); // BOM → Excel reads Hindi names
    a.download = `ng-marshal-trips_${from}_to_${to}${driver ? "_" + driver : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Card = ({ label, value, tone = "#16243A" }: { label: string; value: string | number; tone?: string }) => (
    <div className="bg-white rounded-xl border border-[#D7DEE8] px-4 py-3">
      <p className="text-[11px] text-[#6B7A90] font-semibold">{label}</p>
      <p className="text-[26px] font-extrabold tabular-nums leading-tight" style={{ color: tone }}>{value}</p>
    </div>
  );
  const btn = "bg-white border border-[#CBD5E3] rounded-lg px-3 py-1.5 text-[12px] font-bold hover:bg-[#F4F6F9]";

  return (
    <main className="min-h-screen bg-[#EDF0F4] text-[#16243A]">
      <header className="bg-[#16243A] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link href="/?stay=1" className="hover:opacity-80"><Wordmark dark compact /></Link>
        <span className="text-[13px] font-bold text-[#B9C6DE]">ट्रिप डैशबोर्ड</span>
      </header>

      <div className="max-w-[1200px] mx-auto p-4 flex flex-col gap-4">
        {/* tabs */}
        <div className="flex gap-2">
          {([["overview", "📊 Overview"], ["approvals", "✅ Approvals"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-lg px-4 py-2 text-[13px] font-bold border ${tab === k ? "bg-[#16243A] text-white border-[#16243A]" : "bg-white border-[#CBD5E3] hover:bg-[#F4F6F9]"}`}>
              {label}
              {k === "approvals" && awaiting > 0 && (
                <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] tabular-nums" style={{ background: STATUS.pending.tint, color: STATUS.pending.ink }}>⏳{awaiting}</span>
              )}
            </button>
          ))}
        </div>

        {/* filters */}
        <div className="bg-white rounded-xl border border-[#D7DEE8] p-3 flex flex-wrap items-end gap-3">
          <div className="text-[11px] font-semibold text-[#6B7A90] flex flex-col gap-1">From
            <DayPicker value={from} marks={marks} onPick={setFrom} compact />
          </div>
          <div className="text-[11px] font-semibold text-[#6B7A90] flex flex-col gap-1">To
            <DayPicker value={to} marks={marks} onPick={setTo} compact />
          </div>
          <label className="text-[11px] font-semibold text-[#6B7A90] flex flex-col gap-1">Driver
            <select value={driver} onChange={(e) => setDriver(e.target.value)} className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[13px] text-[#16243A] min-w-[180px]">
              <option value="">All drivers</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <div className="flex gap-1.5 flex-wrap">
            <button className={btn} onClick={() => preset(0, 0)}>Today</button>
            <button className={btn} onClick={() => preset(-1, -1)}>Yesterday</button>
            <button className={btn} onClick={() => preset(-6, 0)}>7 days</button>
            <button className={btn} onClick={thisMonth}>This month</button>
          </div>
          {loading && <span className="text-[12px] text-[#6B7A90]">loading…</span>}
        </div>

        {err && <p className="text-[#C0392B] font-semibold text-[13px]">✕ {err}</p>}
        {note && <p className="bg-[#DDF3E6] text-[#12703E] font-semibold text-[13px] rounded-lg px-3 py-2">{note}</p>}

        {tab === "approvals" ? <Approvals rows={rows} from={from} to={to} onSet={setApproval} /> : (<>

        {/* summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <Card label="🚛 Trips (approved)" value={stats.trips} tone="#1E9E5A" />
          <Card label="⏳ Awaiting approval" value={awaiting} tone={awaiting ? STATUS.pending.ink : "#16243A"} />
          <Card label="Drivers active" value={stats.drivers} />
          <Card label="20ft / 40ft" value={`${stats.ft20} / ${stats.ft40}`} />
          <Card label="Import / Export" value={`${stats.imp} / ${stats.exp}`} />
          <Card label="All parchis" value={stats.parchis} />
          <Card label="OCR pending" value={stats.unread} tone={stats.unread ? "#E8641B" : "#16243A"} />
          <Card label="💰 Revenue" value={`₹${stats.revenue}`} tone="#8A5A00" />
        </div>

        {/* per-driver */}
        <section className="bg-white rounded-xl border border-[#D7DEE8] overflow-x-auto">
          <h2 className="px-4 pt-3 pb-2 text-[14px] font-extrabold">Driver summary</h2>
          <table className="w-full text-[13px]">
            <thead className="bg-[#F4F6F9] text-[#6B7A90] text-[11px] uppercase">
              <tr>{["Driver", "Trips ✅", "⏳ Pending", "Days worked", "Avg/day", "20ft", "40ft", "Import", "Export", "All parchis", "Revenue"].map((h) => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {perDriver.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-[#6B7A90]">इस रेंज में कोई पर्ची नहीं</td></tr>}
              {perDriver.map((d) => (
                <tr key={d.id} onClick={() => setDriver(driver === d.id ? "" : d.id)} className="border-t border-[#EDF0F4] hover:bg-[#F8FAFC] cursor-pointer">
                  <td className="px-3 py-2 font-bold">{d.name}</td>
                  <td className="px-3 py-2 font-extrabold text-[#1E9E5A] tabular-nums">{d.trips}</td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: d.pending ? STATUS.pending.ink : undefined }}>{d.pending}</td>
                  <td className="px-3 py-2 tabular-nums">{d.days.size}</td>
                  <td className="px-3 py-2 tabular-nums">{d.days.size ? (d.trips / d.days.size).toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{d.ft20}</td>
                  <td className="px-3 py-2 tabular-nums">{d.ft40}</td>
                  <td className="px-3 py-2 tabular-nums">{d.imp}</td>
                  <td className="px-3 py-2 tabular-nums">{d.exp}</td>
                  <td className="px-3 py-2 tabular-nums text-[#6B7A90]">{d.parchis}</td>
                  <td className="px-3 py-2 tabular-nums font-bold text-[#8A5A00]">₹{d.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* detail */}
        <section className="bg-white rounded-xl border border-[#D7DEE8] overflow-x-auto">
          <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-extrabold mr-auto">Trip details <span className="text-[#6B7A90] font-semibold">({detail.length})</span></h2>
            <select value={show} onChange={(e) => setShow(e.target.value as Show)} className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[12px]">
              <option value="approved">✅ Approved trips</option>
              <option value="trips">All gate-in (any status)</option>
              <option value="all">All parchis</option>
              <option value="other">Non-trip parchis</option>
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search container / vehicle / gate pass…"
              className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[12px] w-[240px]" />
            <button onClick={() => setAdding((a) => !a)} className="bg-[#2E5395] text-white rounded-lg px-3 py-1.5 text-[12px] font-bold">{adding ? "▲ Close entry" : "➕ Manual entry (paste from Excel)"}</button>
            <button onClick={exportCsv} disabled={!detail.length} className="bg-[#1E9E5A] disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-[12px] font-bold">⬇ Excel / CSV</button>
          </div>
          {adding && <ManualSheet drivers={drivers} defaultDate={to} onClose={() => setAdding(false)} onSaved={onManualSaved} />}
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead className="bg-[#F4F6F9] text-[#6B7A90] text-[11px] uppercase">
              <tr>{COLS.map(([h]) => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}<th /></tr>
            </thead>
            <tbody>
              {detail.map((r) => (
                <tr key={r.id} className={`border-t border-[#EDF0F4] hover:bg-[#F8FAFC] ${r.manualId ? "bg-[#F4F7FD]" : ""}`}>
                  {COLS.map(([h, f]) => (
                    <td key={h} className={`px-3 py-1.5 ${h === "Container" ? "font-mono font-bold" : ""} ${h === "Valid" && r.container_valid === false ? "text-[#E8641B]" : ""}`}>{f(r)}</td>
                  ))}
                  <td className="px-2">
                    {r.manualId && <button onClick={() => deleteManual(r.manualId!)} title="delete manual entry" className="text-[#C0392B] font-bold px-1">✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        </>)}

      </div>
    </main>
  );
}

// ── Manual trip entry — an Excel-like grid. Copy one or many rows in Excel, click a
// cell, Ctrl+V: cells fill from there, extra rows are added. Saved rows are approved
// trips; the API cross-checks each against that day's photos and auto-approves matches.
const TYPES = ["GATE-IN IMPORT", "GATE-IN EXPORT", "GATE-OUT IMPORT", "GATE-OUT EXPORT", "DROP-OFF", "RECEIVE"];
const SHEET_COLS = ["Date", "Driver", "Container no *", "Type", "Size (20/40)", "Gate pass", "Vehicle"] as const;
type Cells = string[];
const blank = (): Cells => SHEET_COLS.map(() => "");
const filled = (r: Cells) => r.some((c) => c.trim());

function ManualSheet({ drivers, defaultDate, onClose, onSaved }: {
  drivers: { id: string; name: string }[]; defaultDate: string;
  onClose: () => void; onSaved: (entries: ManualEntry[], by: string) => void;
}) {
  const [grid, setGrid] = useState<Cells[]>(() => Array.from({ length: 5 }, blank));
  const [rowErr, setRowErr] = useState<Record<number, string>>({});
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { try { setBy(localStorage.getItem("ng-marshal-evaluator") || ""); } catch {} }, []);

  const setCell = (r: number, c: number, v: string) =>
    setGrid((g) => g.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));

  // Excel paste: a block of rows/columns lands with its top-left at the clicked cell.
  // A single value (no tab/newline) is left to the browser as a normal paste.
  const onPaste = (r: number, c: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const block = parsePaste(text);
    setGrid((g) => {
      const out = g.map((row) => [...row]);
      block.forEach((cells, i) => {
        while (out.length <= r + i) out.push(blank());
        cells.forEach((v, j) => { if (c + j < SHEET_COLS.length) out[r + i][c + j] = v; });
      });
      return out;
    });
    setRowErr({});
  };

  const driverFor = (name: string) => {
    const n = name.trim().toLowerCase();
    return n ? drivers.find((d) => d.name.toLowerCase() === n || d.id.toLowerCase() === n) : undefined;
  };

  const used = grid.map((row, i) => [row, i] as const).filter(([row]) => filled(row));

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      try { localStorage.setItem("ng-marshal-evaluator", by.trim()); } catch {}
      const entries = used.map(([[date, drv, cont, type, size, gp, veh]]) => {
        const d = driverFor(drv);
        return {
          tripDate: date.trim() ? parseDay(date) : defaultDate,
          driverId: d?.id ?? "", driverName: d?.name ?? drv.trim(),
          containerNo: cont, parchiType: type || TYPES[0], sizeFt: parseSize(size),
          gatePassNo: gp, vehicleNo: veh,
        };
      });
      const res = await fetch("/api/manual-entries", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ by: by.trim(), entries }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "save failed");
      onSaved(j.entries as ManualEntry[], by.trim());
      // keep only the rows that failed, with their reason, so they can be fixed and re-saved
      const bad: { index: number; error: string }[] = j.errors ?? [];
      if (!bad.length) return onClose();
      setGrid(bad.map((b) => grid[used[b.index][1]]));
      setRowErr(Object.fromEntries(bad.map((b, i) => [i, b.error])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally { setBusy(false); }
  };

  const cell = "w-full px-2 py-1.5 text-[12px] outline-none focus:bg-[#EAF1FF] bg-transparent";
  return (
    <div className="border-y border-[#D7DEE8] bg-[#F8FAFC] px-4 py-3 flex flex-col gap-2">
      <p className="text-[12px] text-[#6B7A90]">
        Excel से rows copy करें → किसी cell पर click → <b>Ctrl+V</b>. एक या कई rows एक साथ paste हो जाएँगी.
        Columns: Date · Driver · Container · Type · Size · Gate pass · Vehicle (खाली date = {defaultDate}).
        सेव करते ही उस दिन की पर्चियों से मिलान होगा.
      </p>
      <div className="overflow-x-auto">
        <table className="text-[12px] border-collapse min-w-[860px] w-full bg-white">
          <thead className="bg-[#F4F6F9] text-[#6B7A90] text-[11px] uppercase">
            <tr><th className="w-8" />{SHEET_COLS.map((h) => <th key={h} className="border border-[#D7DEE8] px-2 py-1 text-left font-bold">{h}</th>)}<th className="w-8" /></tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} className={rowErr[r] ? "bg-[#FBE1E1]" : ""}>
                <td className="text-center text-[11px] text-[#6B7A90] tabular-nums">{r + 1}</td>
                {row.map((v, c) => (
                  <td key={c} className="border border-[#D7DEE8] p-0">
                    <input value={v} onChange={(e) => setCell(r, c, e.target.value)} onPaste={onPaste(r, c)}
                      list={c === 1 ? "sheet-drivers" : c === 3 ? "sheet-types" : undefined}
                      placeholder={c === 0 ? defaultDate : c === 3 ? TYPES[0] : c === 4 ? "40" : ""}
                      className={`${cell} ${c === 2 ? "font-mono font-bold uppercase" : ""}`} />
                  </td>
                ))}
                <td className="text-center">
                  {rowErr[r] ? <span title={rowErr[r]} className="text-[#A12B2B] font-bold">⚠</span>
                    : <button onClick={() => setGrid((g) => g.length > 1 ? g.filter((_, i) => i !== r) : [blank()])} title="remove row" className="text-[#C0392B] font-bold px-1">✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="sheet-drivers">{drivers.map((d) => <option key={d.id} value={d.name} />)}</datalist>
        <datalist id="sheet-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      {Object.keys(rowErr).length > 0 && <p className="text-[#A12B2B] font-semibold text-[12px]">⚠ ये rows सेव नहीं हुईं — {[...new Set(Object.values(rowErr))].join(", ")}. ठीक करके फिर Save करें.</p>}
      {err && <p className="text-[#C0392B] font-semibold text-[13px]">✕ {err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setGrid((g) => [...g, ...Array.from({ length: 5 }, blank)])} className="bg-white border border-[#CBD5E3] rounded-lg px-3 py-1.5 text-[12px] font-bold">+ 5 rows</button>
        <span className="text-[12px] text-[#6B7A90] mr-auto">{used.length} rows filled</span>
        <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Entered by * (your name)"
          className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[12px] w-[200px]" />
        <button onClick={onClose} className="px-3 py-1.5 text-[12px] font-bold text-[#6B7A90]">Cancel</button>
        <button onClick={save} disabled={busy || !used.length || !by.trim()}
          className="bg-[#1E9E5A] disabled:opacity-40 text-white rounded-lg px-4 py-1.5 text-[12px] font-bold">
          {busy ? "saving…" : `✔ Save ${used.length || ""} & cross-check`}
        </button>
      </div>
    </div>
  );
}
