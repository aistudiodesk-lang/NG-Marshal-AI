"use client";

// Searchable driver picker — a <select> is unusable with 70+ names on a phone.
// Type any part of the English or Hindi name; tap a result. Used by the driver app
// login (dark) and the /dashboard driver filter (light).
import { useState } from "react";

export interface PickDriver { id: string; name: string; nameHi?: string }

export default function DriverPicker({ drivers, value, onPick, dark = false, allLabel, placeholder = "नाम खोजो · search name" }: {
  drivers: PickDriver[]; value: string; onPick: (id: string) => void;
  dark?: boolean; allLabel?: string; // allLabel set → first option clears the pick (e.g. "All drivers")
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const picked = drivers.find((d) => d.id === value);
  const label = (d: PickDriver) => (d.nameHi && d.nameHi !== d.name ? `${d.nameHi} · ${d.name}` : d.name);
  const s = q.trim().toLowerCase();
  const hits = drivers.filter((d) => !s || d.name.toLowerCase().includes(s) || (d.nameHi || "").includes(q.trim()));

  const choose = (id: string) => { onPick(id); setQ(""); setOpen(false); };
  const box = dark
    ? "bg-[#101A28] border-2 border-[#2A3A50] text-[#EAF0F8] rounded-xl px-3 py-3.5 text-[20px] text-center"
    : "bg-white border-[#CBD5E3] text-[#16243A] rounded-lg px-2 py-1.5 text-[13px]";
  const item = dark ? "px-4 py-3 text-[17px] border-t border-[#22314A] active:bg-[#22314A]" : "px-3 py-1.5 text-[13px] hover:bg-[#F4F6F9]";

  return (
    <div className="relative w-full">
      <input
        value={open ? q : picked ? label(picked) : ""}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(""); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // let a tap on a result land first
        placeholder={picked ? label(picked) : allLabel || placeholder}
        className={`w-full border font-semibold outline-none ${box}`}
      />
      {open && (
        <div className={`absolute z-30 left-0 right-0 mt-1 max-h-[50vh] overflow-y-auto border shadow-xl ${dark ? "bg-[#101A28] border-[#2A3A52] rounded-2xl" : "bg-white border-[#CBD5E3] rounded-lg"}`}>
          {allLabel && <button onMouseDown={(e) => e.preventDefault()} onClick={() => choose("")} className={`block w-full text-left font-bold ${item}`}>{allLabel}</button>}
          {hits.map((d) => (
            <button key={d.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(d.id)}
              className={`block w-full text-left ${item} ${d.id === value ? "font-extrabold" : ""}`}>{label(d)}</button>
          ))}
          {!hits.length && <p className={`${item} opacity-60`}>कोई नहीं मिला · no match</p>}
        </div>
      )}
    </div>
  );
}
