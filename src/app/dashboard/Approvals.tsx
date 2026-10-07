"use client";

import { useEffect, useMemo, useState } from "react";
import { Approval, Row, STATUS, dayLabel, daysBetween, istDay, istTime } from "./shared";

// Evaluator screen: heatmap (driver × day) + daily stacked bars + per-day/driver review list.
// Tick = approve, untick = back to pending, ❌ = reject (one click). Photo opens a viewer
// with ◀ ▶ and ✔/❌ so a whole day can be cleared without closing it.

type StatusFilter = "all" | Approval;
type Counts = { approved: number; pending: number; rejected: number; total: number };
const zero = (): Counts => ({ approved: 0, pending: 0, rejected: 0, total: 0 });
const add = (c: Counts, s: Approval) => { c[s]++; c.total++; };

const EVAL_KEY = "ng-marshal-evaluator";

export default function Approvals({ rows, from, to, onSet }: {
  rows: Row[]; from: string; to: string;
  onSet: (ids: string[], status: Approval, by: string) => void;
}) {
  const [evaluator, setEvaluator] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [tripsOnly, setTripsOnly] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<number | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  useEffect(() => { try { setEvaluator(localStorage.getItem(EVAL_KEY) || ""); } catch {} }, []);
  const saveName = () => {
    const n = nameDraft.trim();
    if (!n) return;
    setEvaluator(n); setEditingName(false);
    try { localStorage.setItem(EVAL_KEY, n); } catch {}
  };

  // scope = type filter only (cards/charts/group headers ignore the status filter)
  const scope = useMemo(() => rows.filter((r) => !tripsOnly || r.revenue_eligible), [rows, tripsOnly]);
  const days = useMemo(() => (from && to ? daysBetween(from, to) : []), [from, to]);

  const totals = useMemo(() => { const c = zero(); scope.forEach((r) => add(c, r.approval_status)); return c; }, [scope]);
  const oldestPending = useMemo(() => {
    const p = scope.filter((r) => r.approval_status === "pending").map((r) => istDay(r.captured_at)).sort()[0];
    if (!p) return null;
    const age = Math.round((new Date(new Date().toLocaleDateString("en-CA") + "T00:00").getTime() - new Date(p + "T00:00").getTime()) / 864e5);
    return { day: p, age };
  }, [scope]);

  const perDay = useMemo(() => {
    const m: Record<string, Counts> = {};
    scope.forEach((r) => add((m[istDay(r.captured_at)] ??= zero()), r.approval_status));
    return m;
  }, [scope]);

  const heat = useMemo(() => {
    const m = new Map<string, { name: string; cells: Record<string, Counts> }>();
    scope.forEach((r) => {
      if (!m.has(r.driver_id)) m.set(r.driver_id, { name: r.driver_name, cells: {} });
      add((m.get(r.driver_id)!.cells[istDay(r.captured_at)] ??= zero()), r.approval_status);
    });
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [scope]);

  // review groups: day (newest first) × driver; rows inside filtered by status
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; day: string; driverId: string; name: string; counts: Counts; rows: Row[] }>();
    scope.forEach((r) => {
      const day = istDay(r.captured_at), key = `${day}|${r.driver_id}`;
      if (!m.has(key)) m.set(key, { key, day, driverId: r.driver_id, name: r.driver_name, counts: zero(), rows: [] });
      const g = m.get(key)!;
      add(g.counts, r.approval_status);
      if (status === "all" || r.approval_status === status) g.rows.push(r);
    });
    return [...m.values()]
      .filter((g) => g.rows.length)
      .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.captured_at.localeCompare(b.captured_at)) }))
      .sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
  }, [scope, status]);

  const isOpen = (g: { key: string; counts: Counts }) => open[g.key] ?? (status !== "pending" || g.counts.pending > 0);
  const flat = useMemo(() => groups.filter(isOpen).flatMap((g) => g.rows), [groups, open, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (ids: string[], s: Approval) => { if (evaluator && ids.length) onSet(ids, s, evaluator); };
  const jumpTo = (driverId: string, day: string) => {
    const key = `${day}|${driverId}`;
    setStatus("all");
    setOpen((o) => ({ ...o, [key]: true }));
    setTimeout(() => document.getElementById(`g-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // viewer keyboard: ← → navigate, A approve, R reject, Esc close
  useEffect(() => {
    if (viewer === null) return;
    const onKey = (e: KeyboardEvent) => {
      const r = flat[viewer];
      if (e.key === "Escape") setViewer(null);
      else if (e.key === "ArrowRight") setViewer((v) => (v !== null && v < flat.length - 1 ? v + 1 : v));
      else if (e.key === "ArrowLeft") setViewer((v) => (v ? v - 1 : v));
      else if (r && (e.key === "a" || e.key === "A")) set([r.id], "approved");
      else if (r && (e.key === "r" || e.key === "R")) set([r.id], "rejected");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bind each render so it sees fresh rows

  const maxDay = Math.max(1, ...days.map((d) => perDay[d]?.total ?? 0));
  const card = "bg-white rounded-xl border border-[#D7DEE8] px-4 py-3";

  // ── evaluator name gate ──
  if (!evaluator || editingName) {
    return (
      <div className={`${card} max-w-[420px] mx-auto mt-6 flex flex-col gap-3`}>
        <p className="text-[16px] font-extrabold">आपका नाम? · Evaluator name</p>
        <p className="text-[12px] text-[#6B7A90]">हर approval के साथ यह नाम सेव होगा · saved with every approval on this computer</p>
        <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()}
          placeholder="e.g. Anish" className="border border-[#CBD5E3] rounded-lg px-3 py-2 text-[14px]" />
        <div className="flex gap-2">
          <button onClick={saveName} disabled={!nameDraft.trim()} className="bg-[#2E5395] disabled:opacity-40 text-white rounded-lg px-4 py-2 text-[13px] font-bold">Continue</button>
          {evaluator && <button onClick={() => setEditingName(false)} className="text-[13px] text-[#6B7A90] px-3">Cancel</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className={card}><p className="text-[11px] text-[#6B7A90] font-semibold">Total</p><p className="text-[26px] font-extrabold tabular-nums">{totals.total}</p></div>
        {(["approved", "pending", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`${card} text-left ${status === s ? "ring-2 ring-[#2E5395]" : ""}`}>
            <p className="text-[11px] font-semibold" style={{ color: STATUS[s].ink }}>{STATUS[s].icon} {STATUS[s].label}</p>
            <p className="text-[26px] font-extrabold tabular-nums" style={{ color: STATUS[s].ink }}>{totals[s]}</p>
          </button>
        ))}
        <div className={card}>
          <p className="text-[11px] text-[#6B7A90] font-semibold">Oldest pending</p>
          <p className="text-[18px] font-extrabold mt-1" style={{ color: oldestPending && oldestPending.age > 1 ? STATUS.pending.ink : "#16243A" }}>
            {oldestPending ? `${oldestPending.age === 0 ? "today" : `${oldestPending.age} day${oldestPending.age > 1 ? "s" : ""}`} · ${dayLabel(oldestPending.day)}` : "— none"}
          </p>
        </div>
      </div>

      {/* heatmap */}
      <section className={`${card} overflow-x-auto`}>
        <h2 className="text-[14px] font-extrabold mb-1">Approval heatmap <span className="text-[12px] text-[#6B7A90] font-semibold">· approved / total · click a cell to review</span></h2>
        <Legend />
        {heat.length === 0 ? <p className="text-[13px] text-[#6B7A90] py-4">इस रेंज में कोई पर्ची नहीं</p> : (
          <table className="text-[11px] border-separate border-spacing-[2px] mt-2">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white" />
                {days.map((d) => <th key={d} className="font-semibold text-[#6B7A90] px-1 min-w-[44px]">{dayLabel(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {heat.map(([id, h]) => (
                <tr key={id}>
                  <td className="sticky left-0 bg-white pr-3 font-bold text-[12px] whitespace-nowrap">{h.name}</td>
                  {days.map((d) => {
                    const c = h.cells[d];
                    if (!c) return <td key={d} className="h-9 rounded-md bg-[#F1F3F6] text-center text-[#B4BDC9]">·</td>;
                    const s: Approval = c.rejected ? "rejected" : c.pending ? "pending" : "approved";
                    return (
                      <td key={d} onClick={() => jumpTo(id, d)} title={`${dayLabel(d)} · ${h.name} — ✅${c.approved} ⏳${c.pending} ❌${c.rejected}`}
                        className="h-9 rounded-md text-center font-bold tabular-nums cursor-pointer hover:ring-2 hover:ring-[#2E5395]"
                        style={{ background: STATUS[s].tint, color: STATUS[s].ink }}>
                        {c.approved}/{c.total}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* daily stacked bars */}
      <section className={card}>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-[14px] font-extrabold">Daily approvals</h2>
          <p className="text-[12px] text-[#6B7A90] tabular-nums min-h-[18px]">
            {hoverDay && perDay[hoverDay] ? `${dayLabel(hoverDay)} — ✅ ${perDay[hoverDay].approved} · ⏳ ${perDay[hoverDay].pending} · ❌ ${perDay[hoverDay].rejected}` : "hover a bar"}
          </p>
        </div>
        <Legend bars />
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1 h-[160px] mt-3 border-b border-[#D7DEE8] min-w-fit">
            {days.map((d) => {
              const c = perDay[d] ?? zero();
              return (
                <div key={d} onMouseEnter={() => setHoverDay(d)} onMouseLeave={() => setHoverDay(null)}
                  className="flex flex-col justify-end items-center h-full w-[28px] shrink-0 cursor-default">
                  {c.total > 0 && <span className="text-[10px] text-[#6B7A90] tabular-nums mb-0.5">{c.total}</span>}
                  <div className={`w-[18px] flex flex-col-reverse gap-[2px] ${hoverDay === d ? "opacity-100" : "opacity-90"}`} style={{ height: `${(c.total / maxDay) * 130}px` }}>
                    {(["approved", "pending", "rejected"] as const).map((s, i, arr) => c[s] > 0 && (
                      <div key={s} style={{ flexGrow: c[s], background: STATUS[s].fill }}
                        className={i === arr.length - 1 || !arr.slice(i + 1).some((x) => c[x] > 0) ? "rounded-t-[4px]" : ""} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 min-w-fit">
            {days.map((d, i) => (
              <span key={d} className="w-[28px] shrink-0 text-center text-[10px] text-[#6B7A90]">
                {days.length <= 14 || i % Math.ceil(days.length / 14) === 0 ? dayLabel(d).split(" ")[0] : ""}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* review list */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[13px]">
            <option value="pending">⏳ Pending</option>
            <option value="approved">✅ Approved</option>
            <option value="rejected">❌ Rejected</option>
            <option value="all">All</option>
          </select>
          <select value={tripsOnly ? "trips" : "all"} onChange={(e) => setTripsOnly(e.target.value === "trips")} className="border border-[#CBD5E3] rounded-lg px-2 py-1.5 text-[13px]">
            <option value="trips">Trips only (gate-in)</option>
            <option value="all">All parchis</option>
          </select>
          <span className="ml-auto text-[13px] text-[#6B7A90]">
            Evaluator: <b className="text-[#16243A]">{evaluator}</b>{" "}
            <button onClick={() => { setNameDraft(evaluator); setEditingName(true); }} className="text-[#2E5395] font-bold">✎</button>
          </span>
        </div>

        {groups.length === 0 && <p className="text-[13px] text-[#6B7A90] py-6 text-center">कुछ नहीं · nothing here for this filter</p>}

        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const pendingIds = scope.filter((r) => r.driver_id === g.driverId && istDay(r.captured_at) === g.day && r.approval_status === "pending").map((r) => r.id);
            const opened = isOpen(g);
            return (
              <div key={g.key} id={`g-${g.key}`} className="border border-[#D7DEE8] rounded-xl overflow-hidden scroll-mt-20">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-[#F4F6F9]">
                  <button onClick={() => setOpen((o) => ({ ...o, [g.key]: !opened }))} className="font-extrabold text-[13px] text-left">
                    {opened ? "▼" : "▶"} {dayLabel(g.day)} · {g.name}
                  </button>
                  <span className="text-[12px] tabular-nums">
                    <span className="text-[#6B7A90]">{g.counts.total} photos ·</span>{" "}
                    <span style={{ color: STATUS.approved.ink }}>✅{g.counts.approved}</span>{" "}
                    <span style={{ color: STATUS.pending.ink }}>⏳{g.counts.pending}</span>{" "}
                    <span style={{ color: STATUS.rejected.ink }}>❌{g.counts.rejected}</span>
                  </span>
                  <span className="ml-auto">
                    {pendingIds.length > 0
                      ? <button onClick={() => set(pendingIds, "approved")} className="bg-[#1E9E5A] text-white rounded-lg px-3 py-1 text-[12px] font-bold">✔ Approve all {pendingIds.length} pending</button>
                      : <span className="text-[12px] font-bold" style={{ color: STATUS.approved.ink }}>✔ all done</span>}
                  </span>
                </div>

                {opened && g.rows.map((r) => {
                  const st = STATUS[r.approval_status];
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-[#EDF0F4]" style={{ background: r.approval_status === "pending" ? "#fff" : st.tint }}>
                      <input type="checkbox" checked={r.approval_status === "approved"} aria-label="approve"
                        onChange={(e) => set([r.id], e.target.checked ? "approved" : "pending")}
                        className="w-5 h-5 accent-[#1E9E5A] shrink-0 cursor-pointer" />
                      <button onClick={() => setViewer(flat.findIndex((x) => x.id === r.id))} className="shrink-0">
                        {r.url
                          ? <img src={r.url} alt="parchi" loading="lazy" className="w-14 h-14 object-cover rounded-md border border-[#D7DEE8]" />
                          : <span className="w-14 h-14 rounded-md bg-[#EDF0F4] flex items-center justify-center text-[10px] text-[#6B7A90]">no img</span>}
                      </button>
                      <div className="min-w-0 flex-1 text-[12px]">
                        <p className="flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
                          <b className="tabular-nums">{istTime(r.captured_at)}</b>
                          <span className="font-bold">{r.parchi_type || (r.ocr_at ? "—" : "OCR pending")}</span>
                          <span className="font-mono font-bold">{r.container_no || "—"}</span>
                          {r.container_valid != null && <span style={{ color: r.container_valid ? STATUS.approved.ink : STATUS.pending.ink }}>{r.container_valid ? "✓" : "⚠"}</span>}
                          {r.size_ft && <span>{r.size_ft}ft</span>}
                          {r.vehicle_no && <span className="text-[#6B7A90]">{r.vehicle_no}</span>}
                        </p>
                        <p className="text-[11px] text-[#6B7A90] truncate">
                          {[r.gate_pass_no && `gate pass ${r.gate_pass_no}`, r.seal_no && `seal ${r.seal_no}`, r.transporter].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-[11px] flex items-center gap-2">
                        <span className="font-bold" style={{ color: st.ink }}>
                          {st.icon} {r.approval_status === "pending" ? "Pending" : `${r.approved_by ?? ""} ${r.approved_at ? istTime(r.approved_at) : ""}`}
                        </span>
                        {r.approval_status === "rejected"
                          ? <button onClick={() => set([r.id], "pending")} title="undo" className="border border-[#CBD5E3] bg-white rounded-md px-2 py-1">↩</button>
                          : <button onClick={() => set([r.id], "rejected")} title="reject" className="border border-[#CBD5E3] bg-white rounded-md px-2 py-1">❌</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* photo viewer */}
      {viewer !== null && flat[viewer] && (() => {
        const r = flat[viewer];
        const st = STATUS[r.approval_status];
        return (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" onClick={() => setViewer(null)}>
            <div className="flex items-center justify-between px-4 py-3 text-white text-[13px]" onClick={(e) => e.stopPropagation()}>
              <span><b>{r.driver_name}</b> · {dayLabel(istDay(r.captured_at))} {istTime(r.captured_at)} · {r.parchi_type || "—"} · <span className="font-mono">{r.container_no || "—"}</span></span>
              <span className="tabular-nums text-white/70">{viewer + 1} / {flat.length}</span>
              <button onClick={() => setViewer(null)} className="text-[20px] px-2">✕</button>
            </div>
            <div className="flex-1 flex items-center justify-center gap-2 px-2 min-h-0" onClick={(e) => e.stopPropagation()}>
              <button disabled={viewer === 0} onClick={() => setViewer(viewer - 1)} className="text-white text-[36px] px-3 disabled:opacity-20">◀</button>
              {r.url ? <img src={r.url} alt="parchi" className="max-h-full max-w-full object-contain rounded-lg" /> : <p className="text-white">no image</p>}
              <button disabled={viewer === flat.length - 1} onClick={() => setViewer(viewer + 1)} className="text-white text-[36px] px-3 disabled:opacity-20">▶</button>
            </div>
            <div className="flex items-center justify-center gap-3 py-4" onClick={(e) => e.stopPropagation()}>
              <span className="text-[13px] font-bold px-3 py-1 rounded-md" style={{ background: st.tint, color: st.ink }}>{st.icon} {st.label}</span>
              <button onClick={() => set([r.id], "approved")} className="bg-[#1E9E5A] text-white rounded-lg px-5 py-2 font-bold">✔ Approve (A)</button>
              <button onClick={() => set([r.id], "rejected")} className="bg-[#D64545] text-white rounded-lg px-5 py-2 font-bold">❌ Reject (R)</button>
              {r.approval_status !== "pending" && <button onClick={() => set([r.id], "pending")} className="bg-white/90 rounded-lg px-4 py-2 font-bold">↩</button>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Legend({ bars = false }: { bars?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-[#4A5A70]">
      {(["approved", "pending", "rejected"] as const).map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: STATUS[s].fill }} />
          {STATUS[s].icon} {bars ? STATUS[s].label : s === "approved" ? "all approved" : s === "pending" ? "some pending" : "has rejected"}
        </span>
      ))}
      {!bars && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#F1F3F6] border border-[#D7DEE8]" /> no upload</span>}
    </div>
  );
}
