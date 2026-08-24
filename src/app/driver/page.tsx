"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { getIdentity, setIdentity, clearIdentity } from "@/lib/identity";
import { uploadParchi, todayStats } from "@/lib/parchi";
import { Wordmark } from "@/components/Brand";

// Dead-simple parchi collector. Two screens only:
//   1) LOGIN  — pick your name → in. No ITV, no phone, no password, no logout.
//   2) CAPTURE — one big camera button. Snap → upload → counter ticks up. Repeat.
// The camera is a plain <input capture> so it works inside the existing Capacitor
// WebView with NO native plugin and NO APK rebuild.

// small dark select
function Sel({ value, onChange, children, className = "" }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#101A28] border-2 border-[#2A3A50] text-[#EAF0F8] font-bold rounded-xl px-3 py-3.5 appearance-none text-[20px] text-center"
      >
        {children}
      </select>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA0B5] text-[14px] pointer-events-none">▾</span>
    </div>
  );
}

export default function DriverPage() {
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [ready, setReady] = useState(false);

  // who is logged in on this device (persisted in identity localStorage)
  useEffect(() => {
    const id = getIdentity();
    if (id?.role === "driver") setMe({ id: id.personId, name: id.nameLocal || id.name });
    setReady(true);
  }, []);

  const logout = () => {
    clearIdentity();
    setMe(null);
  };

  return (
    <main className="min-h-screen bg-[#31405A] py-5 px-4 flex flex-col items-center gap-3">
      <div className="w-full max-w-[390px] flex justify-between items-center text-[#B9C6DE] text-xs">
        <Link href="/?stay=1" className="hover:opacity-80"><Wordmark dark compact /></Link>
      </div>

      {!ready ? null : me ? (
        <Capture driverId={me.id} driverName={me.name} onSwitch={logout} />
      ) : (
        <Login onLogin={(d) => setMe({ id: d.id, name: d.name })} />
      )}
    </main>
  );
}

// ── LOGIN — pick your name, tap. That's it. ─────────────────────────────────────
function Login({ onLogin }: { onLogin: (d: { id: string; name: string }) => void }) {
  const { state } = useApp();
  const [driverId, setDriverId] = useState("");
  const drivers = state.drivers;

  const start = () => {
    const d = drivers.find((x) => x.id === driverId);
    if (!d) return;
    setIdentity({ personId: d.id, role: "driver", name: d.name, nameLocal: d.nameHi, setAt: new Date().toISOString() });
    onLogin({ id: d.id, name: d.nameHi || d.name });
  };

  return (
    <div className="w-full max-w-[390px] bg-[#101A28] rounded-3xl border-[6px] border-[#060B12] shadow-2xl overflow-hidden text-[#EAF0F8] p-5 flex flex-col gap-6 mt-4">
      <div className="text-center pt-2">
        <p className="text-[13px] text-[#8FA0B5]">नमस्ते · Welcome</p>
        <p className="text-[24px] font-extrabold mt-1">अपना नाम चुनो</p>
        <p className="text-[12px] text-[#8FA0B5] mt-1">choose your name to start</p>
      </div>

      <Sel value={driverId} onChange={setDriverId}>
        <option value="" disabled>नाम चुनो · choose name</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>{d.nameHi || d.name}</option>
        ))}
      </Sel>

      <button
        onClick={start}
        disabled={!driverId}
        className="w-full bg-[#1E9E5A] disabled:opacity-40 rounded-2xl py-5 text-white font-extrabold text-[20px] active:scale-[0.98]"
      >
        काम शुरू करो →
      </button>
      <p className="text-[11px] text-[#5C6B80] text-center -mt-2">बस पर्ची की फोटो खींचनी है · just capture parchi photos</p>
    </div>
  );
}

// ── CAPTURE — the whole app. Camera + today's पर्ची count + 💰 earnings. ──────────
// Capture is INSTANT: the tap counts immediately and the screen is ready again at once.
// Uploading happens in the background; the parchi is then READ on the server (Gemini vision)
// — nothing heavy runs on the phone, so even a cheap handset stays snappy. Revenue pops
// whenever the server finishes reading it.
interface Reward { revenue: number; sizeFt: 20 | 40 | null }

function Capture({ driverId, driverName, onSwitch }: { driverId: string; driverName: string; onSwitch: () => void }) {
  const [count, setCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [reward, setReward] = useState<Reward | null>(null); // celebration overlay
  const [flash, setFlash] = useState(false);                 // brief "captured ✓"
  const [pending, setPending] = useState(0);                 // photos still uploading/reading
  const [err, setErr] = useState("");

  // Load today's count/earnings (survives app reloads).
  useEffect(() => {
    let live = true;
    todayStats(driverId).then((s) => { if (live) { setCount(s.count); setRevenue(s.revenue); } });
    return () => { live = false; };
  }, [driverId]);

  // single-flight read queue — ask the server to read parchis one at a time (keeps things
  // orderly and the reward pops in capture order). The work is all server-side now.
  const ocrQueue = useRef<{ id: string }[]>([]);
  const ocrRunning = useRef(false);
  const pumpOcr = useCallback(() => {
    if (ocrRunning.current) return;
    const job = ocrQueue.current.shift();
    if (!job) return;
    ocrRunning.current = true;
    (async () => {
      try {
        const res = await fetch("/api/parchis/vision", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: job.id }),
        });
        const j = await res.json();
        if (j.eligible && j.revenue > 0) {
          setRevenue((r) => r + j.revenue);
          setReward({ revenue: j.revenue, sizeFt: j.sizeFt });
          setTimeout(() => setReward(null), 2800);
        }
      } catch { /* photo is already saved; office can re-read from /parchis */ }
      finally { ocrRunning.current = false; setPending((p) => Math.max(0, p - 1)); pumpOcr(); }
    })();
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same shot
    if (!file) return;
    // INSTANT: count it and flash ✓ right away — the driver is never on hold
    setErr("");
    setCount((c) => c + 1);
    setPending((p) => p + 1);
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
    // background: upload, then queue the OCR (revenue lands whenever it's ready)
    (async () => {
      try {
        const { id } = await uploadParchi(file, driverId, driverName);
        ocrQueue.current.push({ id });
        pumpOcr();
      } catch {
        setCount((c) => Math.max(0, c - 1));
        setPending((p) => Math.max(0, p - 1));
        setErr("एक फोटो सेव नहीं हुई — दुबारा खींचो");
      }
    })();
  };

  return (
    <div className="w-full max-w-[390px] bg-[#101A28] rounded-3xl border-[6px] border-[#060B12] shadow-2xl overflow-hidden text-[#EAF0F8] relative">
      <div className="flex justify-between items-center px-4 py-3 border-b border-[#2A3A50]">
        <span className="text-[15px] font-extrabold truncate">{driverName}</span>
        <button onClick={onSwitch} className="text-[12px] text-[#8FA0B5] font-bold border border-[#2A3A50] rounded-lg px-2.5 py-1 shrink-0">बदलो</button>
      </div>

      <div className="p-5 flex flex-col gap-5">
        {/* today's two counters: parchi count + earnings */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="text-center bg-[#0B1420] rounded-2xl py-3 border border-[#2A3A50]">
            <p className="text-[11px] text-[#8FA0B5]">आज पर्ची</p>
            <p className="text-[40px] font-extrabold leading-none tabular-nums text-[#4CD584]">{count}</p>
          </div>
          <div className="text-center bg-[#0B1420] rounded-2xl py-3 border border-[#2A3A50]">
            <p className="text-[11px] text-[#8FA0B5]">💰 आज कमाई</p>
            <p className="text-[40px] font-extrabold leading-none tabular-nums text-[#FFC85C]">₹{revenue}</p>
          </div>
        </div>

        {/* big camera button — never disabled; capture is instant */}
        <label className="w-full rounded-2xl py-8 flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition bg-[#E8641B]">
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPick} />
          <span className="text-[46px] leading-none">📷</span>
          <span className="text-white font-extrabold text-[22px]">पर्ची कैप्चर करो</span>
          <span className="text-white/80 text-[12px]">tap to open camera</span>
        </label>

        {/* status line — capture is instant; upload/OCR just hum along in the background */}
        <div className="min-h-[24px] text-center">
          {err ? (
            <p className="text-[13px] font-bold text-[#FF9E9E]">✕ {err}</p>
          ) : flash ? (
            <p className="text-[15px] font-bold text-[#4CD584]">✓ पर्ची कैप्चर हुई</p>
          ) : pending > 0 ? (
            <p className="text-[12px] text-[#8FA0B5]">बैकग्राउंड में सेव हो रहा है… <span className="opacity-70">({pending})</span></p>
          ) : null}
        </div>

        <p className="text-[11px] text-[#5C6B80] text-center border-t border-[#2A3A50] pt-3">
          हर पर्ची की एक फोटो खींचो · take one photo per parchi
        </p>
      </div>

      {/* 🎉 revenue celebration overlay */}
      {reward && (
        <div className="absolute inset-0 z-20 bg-[#0A2A18]/97 flex flex-col items-center justify-center gap-2 text-center animate-[fadeIn_0.15s_ease-out]">
          <span className="text-[60px] leading-none">🎉</span>
          <p className="text-[16px] text-[#BDF0D2] font-bold">कमाई जुड़ी!</p>
          <p className="text-[64px] font-extrabold leading-none text-[#FFC85C]">₹{reward.revenue}</p>
          <p className="text-[15px] text-[#BDF0D2] font-semibold">{reward.sizeFt ? `${reward.sizeFt}ft container` : ""} · gate-in ✓</p>
          <p className="text-[13px] text-[#7FBF9C] mt-1">अगली पर्ची कैप्चर करो →</p>
        </div>
      )}
    </div>
  );
}
