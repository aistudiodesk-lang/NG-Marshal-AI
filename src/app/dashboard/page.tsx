"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Wordmark } from "@/components/Brand";

// Office dashboard: trips per driver over a date range + every parchi's extracted
// details (no photos). Trip = gate-in parchi (revenue_eligible), same rule as lib/revenue.ts.

interface Row {
  id: string; driver_id: string; driver_name: string; captured_at: string;
  parchi_type: string | null; container_no: string | null; container_valid: boolean | null;
  iso_code: string | null; size_ft: number | null; gate_pass_no: string | null; cycle: string | null;
  doc_datetime: string | null; vehicle_no: string | null; seal_no: string | null; transporter: string | null;
  revenue: number | null; revenue_eligible: boolean | null; ocr_at: string | null;
}

const ymd = (d: Date) => d.toLocaleDateString("en-CA");
const shiftDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const istDT = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const cycleOf = (r: Row) => { const c = (r.cycle || r.parchi_type || "").toUpperCase(); return c.includes("IMP") ? "IMPORT" : c.includes("EXP") ? "EXPORT" : ""; };

type Show = "trips" | "all" | "other";

export default function DashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [driver, setDriver] = useState("");
  const [show, setShow] = useState<Show>("trips");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

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
  }, [from, to, driver]);

  const preset = (a: number, b: number) => { setFrom(shiftDays(a)); setTo(shiftDays(b)); };
  const thisMonth = () => { const d = new Date(); setFrom(ymd(new Date(d.getFullYear(), d.getMonth(), 1))); setTo(ymd(d)); };

  const trips = rows.filter((r) => r.revenue_eligible);
  const stats = {
    trips: trips.length,
    parchis: rows.length,
    drivers: new Set(trips.map((r) => r.driver_id)).size,
    ft20: trips.filter((r) => r.size_ft === 20).length,
    ft40: trips.filter((r) => r.size_ft === 40).length,
    imp: trips.filter((r) => cycleOf(r) === "IMPORT").length,
    exp: trips.filter((r) => cycleOf(r) === "EXPORT").length,
    revenue: rows.reduce((a, r) => a + (r.revenue || 0), 0),
    unread: rows.filter((r) => !r.ocr_at).length,
  };

  const perDriver = useMemo(() => {
    const m = new Map<string, { id: string; name: string; trips: number; parchis: number; ft20: number; ft40: number; imp: number; exp: number; revenue: number; days: Set<string> }>();
    for (const r of rows) {
      if (!m.has(r.driver_id)) m.set(r.driver_id, { id: r.driver_id, name: r.driver_name, trips: 0, parchis: 0, ft20: 0, ft40: 0, imp: 0, exp: 0, revenue: 0, days: new Set() });
      const g = m.get(r.driver_id)!;
      g.parchis++;
      g.revenue += r.revenue || 0;
      if (!r.revenue_eligible) continue;
      g.trips++;
      g.days.add(new Date(r.captured_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
      if (r.size_ft === 20) g.ft20++;
      if (r.size_ft === 40) g.ft40++;
      if (cycleOf(r) === "IMPORT") g.imp++;
      if (cycleOf(r) === "EXPORT") g.exp++;
    }
    return [...m.values()].sort((a, b) => b.trips - a.trips || b.parchis - a.parchis);
  }, [rows]);

  const detail = useMemo(() => {
    const s = search.trim().toUpperCase();
    return rows.filter((r) =>
      (show === "all" || (show === "trips" ? r.revenue_eligible : !r.revenue_eligible)) &&
      (!s || [r.container_no, r.vehicle_no, r.gate_pass_no, r.seal_no, r.transporter].some((v) => (v || "").toUpperCase().includes(s))));
  }, [rows, show, search]);

  const COLS: [string, (r: Row) => string | number][] = [
    ["Date/Time", (r) => istDT(r.captured_at)],
    ["Driver", (r) => r.driver_name],
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
  ];

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
        {/* filters */}
        <div className="bg-white rounded-xl border border-[#D7DEE8] p-3 flex flex-wrap items-end gap-3">
          <label className="text-[11px] font-semibold text-[#6B7A90] flex flex-col gap-1">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[13px] text-[#16243A]" />
          </label>
          <label className="text-[11px] font-semibold text-[#6B7A90] flex flex-col gap-1">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[13px] text-[#16243A]" />
          </label>
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

        {/* summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card label="🚛 Trips (gate-in)" value={stats.trips} tone="#1E9E5A" />
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
              <tr>{["Driver", "Trips", "Days worked", "Avg/day", "20ft", "40ft", "Import", "Export", "All parchis", "Revenue"].map((h) => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {perDriver.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-[#6B7A90]">इस रेंज में कोई पर्ची नहीं</td></tr>}
              {perDriver.map((d) => (
                <tr key={d.id} onClick={() => setDriver(driver === d.id ? "" : d.id)} className="border-t border-[#EDF0F4] hover:bg-[#F8FAFC] cursor-pointer">
                  <td className="px-3 py-2 font-bold">{d.name}</td>
                  <td className="px-3 py-2 font-extrabold text-[#1E9E5A] tabular-nums">{d.trips}</td>
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
              <option value="trips">Trips only (gate-in)</option>
              <option value="all">All parchis</option>
              <option value="other">Non-trip parchis</option>
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search container / vehicle / gate pass…"
              className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[12px] w-[240px]" />
            <button onClick={exportCsv} disabled={!detail.length} className="bg-[#1E9E5A] disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-[12px] font-bold">⬇ Excel / CSV</button>
          </div>
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead className="bg-[#F4F6F9] text-[#6B7A90] text-[11px] uppercase">
              <tr>{COLS.map(([h]) => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {detail.map((r) => (
                <tr key={r.id} className="border-t border-[#EDF0F4] hover:bg-[#F8FAFC]">
                  {COLS.map(([h, f]) => (
                    <td key={h} className={`px-3 py-1.5 ${h === "Container" ? "font-mono font-bold" : ""} ${h === "Valid" && r.container_valid === false ? "text-[#E8641B]" : ""}`}>{f(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
