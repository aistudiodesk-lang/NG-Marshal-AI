"use client";

// Driver dropdown WITH search — 70+ names. Tap → the full list opens (scroll and pick,
// like a normal dropdown) with a 🔍 box on top: type any part of the English or Hindi
// name to narrow it. Used by the driver app login (dark) and the /dashboard filter (light).
import { useEffect, useRef, useState } from "react";

export interface PickDriver { id: string; name: string; nameHi?: string }

export default function DriverPicker({ drivers, value, onPick, dark = false, allLabel, placeholder = "नाम चुनो · choose name" }: {
  drivers: PickDriver[]; value: string; onPick: (id: string) => void;
  dark?: boolean; allLabel?: string; // allLabel set → first option clears the pick (e.g. "All drivers")
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const picked = drivers.find((d) => d.id === value);
  const label = (d: PickDriver) => (d.nameHi && d.nameHi !== d.name ? `${d.nameHi} · ${d.name}` : d.name);
  const s = q.trim().toLowerCase();
  const hits = drivers.filter((d) => !s || d.name.toLowerCase().includes(s) || (d.nameHi || "").includes(q.trim()));

  // close when tapping anywhere outside
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);

  const choose = (id: string) => { onPick(id); setQ(""); setOpen(false); };
  const t = dark
    ? { btn: "bg-[#101A28] border-2 border-[#2A3A50] text-[#EAF0F8] rounded-xl px-3 py-3.5 text-[20px]",
        panel: "bg-[#101A28] border-2 border-[#2A3A50] rounded-xl", search: "bg-[#1A2638] text-[#EAF0F8] text-[18px] py-3",
        item: "px-4 py-3 text-[17px] border-t border-[#22314A] active:bg-[#22314A]", muted: "text-[#8FA0B5]" }
    : { btn: "bg-white border border-[#CBD5E3] text-[#16243A] rounded-lg px-2 py-1.5 text-[13px]",
        panel: "bg-white border border-[#CBD5E3] rounded-lg", search: "bg-[#F4F6F9] text-[#16243A] text-[13px] py-1.5",
        item: "px-3 py-1.5 text-[13px] hover:bg-[#F4F6F9]", muted: "text-[#6B7A90]" };

  return (
    <div ref={root} className="relative w-full">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 font-semibold text-left ${t.btn}`}>
        <span className={`truncate ${picked ? "" : t.muted}`}>{picked ? label(picked) : allLabel || placeholder}</span>
        <span className={t.muted}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className={`absolute z-30 left-0 right-0 mt-1 shadow-xl overflow-hidden ${t.panel}`}>
          <div className="p-2">
            <input autoFocus={!dark} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 नाम खोजो · search"
              className={`w-full rounded-lg px-3 outline-none font-semibold ${t.search}`} />
          </div>
          <div className="max-h-[45vh] overflow-y-auto">
            {allLabel && !s && <button type="button" onClick={() => choose("")} className={`block w-full text-left font-bold ${t.item}`}>{allLabel}</button>}
            {hits.map((d) => (
              <button type="button" key={d.id} onClick={() => choose(d.id)}
                className={`block w-full text-left ${t.item} ${d.id === value ? "font-extrabold" : ""}`}>{label(d)}</button>
            ))}
            {!hits.length && <p className={`${t.item} ${t.muted}`}>कोई नहीं मिला · no match</p>}
          </div>
        </div>
      )}
    </div>
  );
}
