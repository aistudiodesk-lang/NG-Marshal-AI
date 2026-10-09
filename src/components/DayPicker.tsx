"use client";

import { useEffect, useState } from "react";

// Month calendar that highlights days which HAVE parchi uploads (a native
// <input type=date> can't mark days, and its `max` bakes into the prerender).
// Marks come from /api/parchis?days=1 → { "YYYY-MM-DD": count }.

const todayLocal = () => new Date().toLocaleDateString("en-CA");

/** Shared hook: the { day: count } map used to highlight calendars. */
export function useUploadDays(): Record<string, number> {
  const [marks, setMarks] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch("/api/parchis?days=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((x) => x.days && setMarks(x.days))
      .catch(() => {});
  }, []);
  return marks;
}

export default function DayPicker({ value, marks, onPick, compact = false }: {
  value: string; marks: Record<string, number>; onPick: (d: string) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || todayLocal()).slice(0, 7));
  useEffect(() => { if (value) setMonth(value.slice(0, 7)); }, [value]);

  const [y, m] = month.split("-").map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const nDays = new Date(y, m, 0).getDate();
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const today = todayLocal();
  const label = value ? value.split("-").reverse().join("-") : "…";

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className={`bg-white border border-[#CBD5E3] rounded-lg font-semibold ${compact ? "px-2 py-1.5 text-[13px]" : "px-3 py-2 text-[14px]"}`}>
        📅 {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 bg-white border border-[#CBD5E3] rounded-lg shadow-lg p-3 w-[280px]">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => shift(-1)} className="px-2 text-[18px]">‹</button>
              <span className="font-bold text-[14px]">
                {new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </span>
              <button onClick={() => shift(1)} className="px-2 text-[18px]">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[#6B7A90] mb-1">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: nDays }, (_, i) => {
                const d = `${month}-${String(i + 1).padStart(2, "0")}`;
                const n = marks[d];
                const sel = d === value;
                return (
                  <button key={d} onClick={() => { onPick(d); setOpen(false); }} title={n ? `${n} पर्ची` : undefined}
                    className={`relative h-9 rounded-md text-[13px] font-semibold ${sel ? "bg-[#2E5395] text-white"
                      : n ? "bg-[#D6F2E2] text-[#12703E] hover:bg-[#BDE8CF]" : "hover:bg-[#EDF0F4]"}
                      ${d === today && !sel ? "ring-1 ring-[#2E5395]" : ""}`}>
                    {i + 1}
                    {n ? <span className={`absolute -top-1 -right-1 text-[9px] leading-none rounded-full px-1 py-0.5 ${sel ? "bg-white text-[#2E5395]" : "bg-[#1E9E5A] text-white"}`}>{n}</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[#6B7A90]">🟩 = पर्ची अपलोड हुई (संख्या ऊपर)</p>
          </div>
        </>
      )}
    </div>
  );
}
