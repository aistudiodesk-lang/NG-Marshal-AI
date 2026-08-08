"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp, SHIFT } from "@/lib/store";
import { getIdentity, setIdentity } from "@/lib/identity";
import { ReportRow } from "@/lib/types";
import { Wordmark } from "@/components/Brand";

// ── Fixed lists ────────────────────────────────────────────────────────────────
// The 8 working ITVs (login dropdown) and the terminal/yard locations (from → to).
// Kept here so the driver can only pick real values — no typing, no mistakes.
const LOGIN_ITVS = ["A157", "A670", "7118", "A408", "A142", "A198", "A225", "A333"];
const LOCATIONS = ["CT2", "CT3", "T2", "CT4", "MICT", "EXIM-1", "EXIM-2"];
// Mode dropdown — PLACEHOLDER values until the operator gives the real list.
const MODES = ["Import", "Export", "Shifting", "Empty", "Repo"];

const today = () => new Date().toISOString().slice(0, 10);
const blankRow = (): ReportRow => ({ type: "40", from: "", to: "", mode: "", container: "" });

// small dark select
function Sel({ value, onChange, children, className = "" }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#101A28] border-2 border-[#2A3A50] text-[#EAF0F8] font-bold rounded-xl px-3 py-3 appearance-none text-[15px]"
      >
        {children}
      </select>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA0B5] text-[14px] pointer-events-none">▾</span>
    </div>
  );
}

export default function DriverPage() {
  const { state, dispatch } = useApp();

  // Device identity → whose view this is. Keeps the current driver selected across opens.
  useEffect(() => {
    const id = getIdentity();
    if (id?.role === "driver" && id.personId !== state.meDriverId) {
      dispatch({ type: "setMe", driverId: id.personId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = state.drivers.find((d) => d.id === state.meDriverId);
  const onShift = !!me?.onDuty;
  const myVeh = state.vehicles.find((v) => v.id === state.meVehicleId) ?? state.vehicles.find((v) => v.driverId === state.meDriverId);
  const itv = myVeh?.id;

  return (
    <main className="min-h-screen bg-[#31405A] py-5 px-4 flex flex-col items-center gap-3">
      <div className="w-full max-w-[390px] flex justify-between items-center text-[#B9C6DE] text-xs">
        <Link href="/?stay=1" className="hover:opacity-80"><Wordmark dark compact /></Link>
        <span>{SHIFT.label}</span>
      </div>

      {onShift && me && itv ? (
        <Home driverName={me.nameHi || me.name} itv={itv} />
      ) : (
        <Login />
      )}

      {/* toast */}
      {state.toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 bg-[#16243A] text-white text-[13px] font-semibold px-4 py-2.5 rounded-full shadow-xl border border-[#2E5395] max-w-[90vw] text-center">
          {state.toast}
        </div>
      )}
    </main>
  );
}

// ── LOGIN — pick ITV + name, tap शुरू करो. No password, no phone shown. ──────────
function Login() {
  const { state, dispatch } = useApp();
  const id = typeof window !== "undefined" ? getIdentity() : null;
  const [driverId, setDriverId] = useState<string>(id?.personId ?? "");
  const [itv, setItv] = useState<string>("");

  const drivers = state.drivers;
  const canStart = !!driverId && !!itv;

  const start = () => {
    const d = drivers.find((x) => x.id === driverId);
    if (!d || !itv) return;
    setIdentity({ personId: d.id, role: "driver", name: d.name, nameLocal: d.nameHi, setAt: new Date().toISOString() });
    dispatch({ type: "setMe", driverId: d.id });
    dispatch({ type: "claimItv", vehicleId: itv });
    dispatch({ type: "goOnDuty" });
  };

  return (
    <div className="w-full max-w-[390px] bg-[#101A28] rounded-3xl border-[6px] border-[#060B12] shadow-2xl overflow-hidden text-[#EAF0F8] p-5 flex flex-col gap-5">
      <div className="text-center pt-1">
        <p className="text-[13px] text-[#8FA0B5]">नमस्ते · Welcome</p>
        <p className="text-[24px] font-extrabold">काम शुरू करने के लिए login करो</p>
        <p className="text-[12px] text-[#8FA0B5] mt-1">अपनी ITV और नाम चुनो</p>
      </div>

      {/* ITV */}
      <div>
        <p className="text-[12px] text-[#8FA0B5] mb-1.5 font-semibold">आपकी ITV · Your ITV</p>
        <Sel value={itv} onChange={setItv} className="[&_select]:text-[22px] [&_select]:font-mono [&_select]:text-center [&_select]:py-3.5">
          <option value="" disabled>ITV चुनो · choose</option>
          {LOGIN_ITVS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </Sel>
      </div>

      {/* Name */}
      <div>
        <p className="text-[12px] text-[#8FA0B5] mb-1.5 font-semibold">आपका नाम · Your name</p>
        <Sel value={driverId} onChange={setDriverId} className="[&_select]:text-[20px] [&_select]:text-center [&_select]:py-3.5">
          <option value="" disabled>नाम चुनो · choose</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.nameHi || d.name}</option>
          ))}
        </Sel>
      </div>

      <button
        onClick={start}
        disabled={!canStart}
        className="w-full bg-[#1E9E5A] disabled:opacity-40 rounded-2xl py-5 text-white font-extrabold text-[20px] active:scale-[0.98]"
      >
        काम शुरू करो →
      </button>
      <p className="text-[11px] text-[#5C6B80] text-center">login के बाद logout की ज़रूरत नहीं — अगला driver वही ITV चुन ले</p>
    </div>
  );
}

// ── HOME — logged in. One button: पर्ची भरो. Plus handover (बदलो). ───────────────
function Home({ driverName, itv }: { driverName: string; itv: string }) {
  const { state, dispatch } = useApp();
  const [showForm, setShowForm] = useState(false);

  const myReportsToday = state.driverReports.filter((r) => r.itv === itv && r.date === today() && r.driverId === state.meDriverId);
  const tripsToday = myReportsToday.reduce((a, r) => a + r.normal.length + r.scanning.length, 0);

  const handover = () => {
    if (confirm("ड्यूटी बंद? अगला driver इसी ITV से login करेगा।")) dispatch({ type: "goOffDuty" });
  };

  return (
    <>
      <div className="w-full max-w-[390px] bg-[#101A28] rounded-3xl border-[6px] border-[#060B12] shadow-2xl overflow-hidden text-[#EAF0F8]">
        <div className="flex justify-between items-center px-4 py-3 border-b border-[#2A3A50]">
          <span className="flex items-center gap-2 text-[13px] font-bold text-[#4CD584]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4CD584] animate-pulse" /> LIVE
          </span>
          <span className="font-mono text-[12px] font-bold bg-[#1A2739] border border-[#2A3A50] text-[#FFC08A] px-2 py-0.5 rounded">{itv}</span>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="text-center py-2">
            <p className="text-[13px] text-[#8FA0B5]">नमस्ते · Welcome</p>
            <p className="text-[28px] font-extrabold leading-tight">{driverName}</p>
            <p className="text-[13px] text-[#8FA0B5] mt-1">ITV <b className="text-[#FFC08A] font-mono">{itv}</b> · आज {tripsToday > 0 ? <b className="text-[#4CD584]">{tripsToday} trips दर्ज</b> : "अभी तक कोई पर्ची नहीं"}</p>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-[#E8641B] rounded-2xl py-6 text-white font-extrabold text-[22px] active:scale-[0.98]"
          >
            📋 पर्ची भरो
          </button>
          <p className="text-[12px] text-[#8FA0B5] text-center -mt-1">काम खत्म होने पर पर्ची के हिसाब से भरो</p>

          <button onClick={handover} className="w-full text-[13px] text-[#8FA0B5] py-2 border-t border-[#2A3A50] mt-1">
            ड्राइवर / ITV बदलो · handover
          </button>
        </div>
      </div>

      {showForm && <ParchiForm itv={itv} onClose={() => setShowForm(false)} />}
    </>
  );
}

// ── PARCHI FORM — the daily report. Two sections, all dropdowns + container no. ──
function RowEditor({ row, onChange, onRemove, idx }: { row: ReportRow; onChange: (r: ReportRow) => void; onRemove: () => void; idx: number }) {
  return (
    <div className="bg-[#0B1420] border border-[#2A3A50] rounded-2xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#8FA0B5]">#{idx + 1}</span>
        <button onClick={onRemove} className="text-[11px] font-bold text-[#FF9E9E] border border-[#D64545]/50 rounded px-2 py-0.5">हटाओ ✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Sel value={row.type} onChange={(v) => onChange({ ...row, type: v as "20" | "40" })}>
          <option value="20">20&apos;</option>
          <option value="40">40&apos;</option>
        </Sel>
        <Sel value={row.mode ?? ""} onChange={(v) => onChange({ ...row, mode: v })}>
          <option value="">Mode चुनो</option>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </Sel>
        <Sel value={row.from} onChange={(v) => onChange({ ...row, from: v })}>
          <option value="" disabled>From</option>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </Sel>
        <Sel value={row.to} onChange={(v) => onChange({ ...row, to: v })}>
          <option value="" disabled>To</option>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </Sel>
      </div>
      <input
        value={row.container ?? ""}
        onChange={(e) => onChange({ ...row, container: e.target.value.toUpperCase() })}
        placeholder="Container No"
        className="w-full bg-[#101A28] border-2 border-[#2A3A50] rounded-xl px-3 py-2.5 font-mono text-[14px] text-white placeholder-[#5C6B80] outline-none"
        maxLength={13}
      />
    </div>
  );
}

function Section({ title, rows, setRows, accent }: { title: string; rows: ReportRow[]; setRows: (r: ReportRow[]) => void; accent: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-extrabold" style={{ color: accent }}>{title} <span className="text-[#8FA0B5] font-normal">· {rows.length}</span></p>
      {rows.map((r, i) => (
        <RowEditor
          key={i}
          row={r}
          idx={i}
          onChange={(nr) => setRows(rows.map((x, j) => (j === i ? nr : x)))}
          onRemove={() => setRows(rows.filter((_, j) => j !== i))}
        />
      ))}
      <button onClick={() => setRows([...rows, blankRow()])} className="w-full border-2 border-dashed border-[#2A3A50] text-[#8FA0B5] rounded-xl py-2.5 text-[13px] font-bold">
        + पंक्ति जोड़ो · add row
      </button>
    </div>
  );
}

function ParchiForm({ itv, onClose }: { itv: string; onClose: () => void }) {
  const { dispatch } = useApp();
  const [batch, setBatch] = useState("");
  const [startKm, setStartKm] = useState("");
  const [endKm, setEndKm] = useState("");
  const [diesel, setDiesel] = useState("");
  const [breakdown, setBreakdown] = useState("");
  const [remark, setRemark] = useState("");
  const [normal, setNormal] = useState<ReportRow[]>([blankRow()]);
  const [scanning, setScanning] = useState<ReportRow[]>([]);

  const clean = (rows: ReportRow[]) => rows.filter((r) => r.from || r.to || r.container || r.mode);
  const totalRows = clean(normal).length + clean(scanning).length;
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  const submit = () => {
    const n = clean(normal);
    const sc = clean(scanning);
    if (n.length + sc.length === 0) return;
    dispatch({
      type: "submitReport",
      report: {
        date: today(),
        itv,
        batch: batch.trim() || undefined,
        startKm: num(startKm),
        endKm: num(endKm),
        diesel: num(diesel),
        breakdown: breakdown.trim() || undefined,
        remark: remark.trim() || undefined,
        normal: n,
        scanning: sc,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#0B1420] overflow-y-auto">
      <div className="max-w-[420px] mx-auto p-4 pb-28 flex flex-col gap-4 text-[#EAF0F8]">
        {/* header */}
        <div className="flex items-center justify-between pt-1">
          <button onClick={onClose} className="text-[14px] text-[#8FA0B5] font-bold">✕ बंद</button>
          <p className="text-[16px] font-extrabold">पर्ची भरो</p>
          <span className="font-mono text-[12px] font-bold bg-[#1A2739] border border-[#2A3A50] text-[#FFC08A] px-2 py-0.5 rounded">{itv}</span>
        </div>
        <p className="text-[12px] text-[#8FA0B5] text-center -mt-2">ITV <b className="text-[#FFC08A] font-mono">{itv}</b> · तारीख <b className="text-[#EAF0F8]">{today()}</b> (अपने आप)</p>

        {/* day-level fields */}
        <div className="bg-[#101A28] border border-[#2A3A50] rounded-2xl p-3 grid grid-cols-2 gap-2">
          <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Batch No" className="col-span-2 bg-[#0B1420] border-2 border-[#2A3A50] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-[#5C6B80] outline-none" />
          <input value={startKm} onChange={(e) => setStartKm(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="Start KM" className="bg-[#0B1420] border-2 border-[#2A3A50] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-[#5C6B80] outline-none tabular-nums" />
          <input value={endKm} onChange={(e) => setEndKm(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="End KM" className="bg-[#0B1420] border-2 border-[#2A3A50] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-[#5C6B80] outline-none tabular-nums" />
          <input value={diesel} onChange={(e) => setDiesel(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Diesel (L)" className="bg-[#0B1420] border-2 border-[#2A3A50] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-[#5C6B80] outline-none tabular-nums" />
          <input value={breakdown} onChange={(e) => setBreakdown(e.target.value)} placeholder="Breakdown time" className="bg-[#0B1420] border-2 border-[#2A3A50] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-[#5C6B80] outline-none" />
          <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Remark" className="col-span-2 bg-[#0B1420] border-2 border-[#2A3A50] rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-[#5C6B80] outline-none" />
        </div>

        <Section title="सामान्य · Normal" rows={normal} setRows={setNormal} accent="#4CD584" />
        <Section title="स्कैनिंग · Scanning" rows={scanning} setRows={setScanning} accent="#F5B94B" />
      </div>

      {/* sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0B1420] border-t border-[#2A3A50] p-4">
        <div className="max-w-[420px] mx-auto">
          <button
            onClick={submit}
            disabled={totalRows === 0}
            className="w-full bg-[#1E9E5A] disabled:opacity-40 rounded-2xl py-4 text-white font-extrabold text-[18px] active:scale-[0.98]"
          >
            जमा करो ✓ {totalRows > 0 && `· ${totalRows} entries`}
          </button>
        </div>
      </div>
    </div>
  );
}
