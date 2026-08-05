"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect, useRef } from "react";
import { useApp, SITE, SHIFT } from "@/lib/store";
import { getIdentity } from "@/lib/identity";
import { fmtClock, fmtInr, isValidContainerNo } from "@/lib/incentive";
import { Trip } from "@/lib/types";
import { Wordmark } from "@/components/Brand";

function Slide({ label, sub, color, onClick }: { label: string; sub?: string; color: "green" | "orange"; onClick: () => void }) {
  const bg = color === "green" ? "bg-[#1E9E5A]" : "bg-[#E8641B]";
  const fg = color === "green" ? "text-[#1E9E5A]" : "text-[#E8641B]";
  return (
    <button onClick={onClick} className={`relative w-full ${bg} rounded-full py-4 pl-16 pr-4 text-white font-bold text-[17px] active:scale-[0.98] transition-transform`}>
      <span className={`absolute left-1.5 top-1.5 bottom-1.5 w-12 bg-white rounded-full grid place-items-center text-xl font-extrabold ${fg}`}>→</span>
      {label}
      {sub && <span className="block text-[11px] font-medium opacity-85">{sub}</span>}
    </button>
  );
}

const CONFETTI = ["🎉", "✨", "🏆", "💰", "⭐", "🎊"];

function Celebration({ teu, bonus, target, onClose }: { teu: string; bonus: number; target: number; onClose: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        emoji: CONFETTI[i % CONFETTI.length],
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.2 + Math.random() * 1.8,
        size: 18 + Math.random() * 20,
      })),
    []
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center overflow-hidden" onClick={onClose}>
      <style>{`@keyframes fall{0%{transform:translateY(-12vh) rotate(0)}100%{transform:translateY(112vh) rotate(340deg)}}
      @keyframes pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
      @media(prefers-reduced-motion:reduce){.cfp{display:none}.popcard{animation:none!important}}`}</style>
      {pieces.map((p, i) => (
        <span key={i} className="cfp absolute top-0 pointer-events-none" style={{ left: `${p.left}%`, fontSize: p.size, animation: `fall ${p.dur}s linear ${p.delay}s infinite` }}>
          {p.emoji}
        </span>
      ))}
      <div className="popcard bg-[#101A28] border-2 border-[#F5B94B] rounded-3xl px-8 py-8 text-center mx-6 max-w-[330px]" style={{ animation: "pop .5s ease-out" }}>
        <p className="text-[64px] leading-none">🏆</p>
        <p className="text-[30px] font-extrabold text-white mt-2">{teu} TEU!</p>
        <p className="text-[17px] font-bold text-[#F5B94B] mt-1">बोनस +{fmtInr(bonus)} 🎉</p>
        <p className="text-[12px] text-[#8FA0B5] mt-2">{target}+ TEU इस शिफ्ट में — शाबाश!</p>
        <button className="mt-4 bg-[#1E9E5A] text-white font-bold rounded-full px-8 py-2.5 text-[14px]">ठीक है 👍</button>
      </div>
    </div>
  );
}

export default function DriverPage() {
  const { state, dispatch } = useApp();
  const [showProblem, setShowProblem] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [typedNo, setTypedNo] = useState("");
  const [typedSize, setTypedSize] = useState<"20" | "40">("40");
  const [peek, setPeek] = useState(false);

  const rc = state.rateCard;
  const mt = state.milestoneTeu;
  // Device identity (set once at onboarding) decides whose view this is — zero clicks.
  useEffect(() => {
    const id = getIdentity();
    if (id?.role === "driver" && id.personId !== state.meDriverId) {
      dispatch({ type: "setMe", driverId: id.personId });
    }
    setPeek(new URLSearchParams(window.location.search).get("peek") === "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = state.drivers.find((d) => d.id === state.meDriverId) ?? state.drivers[0];
  const mappedVeh = state.vehicles.find((v) => v.driverId === state.meDriverId);

  // ── ITV confirm on login ──────────────────────────────────────────────────────
  // His allocated ITV (from the master mapping) shows by default; he just says yes —
  // or types the ITV he's actually on today. The chosen call sign drives his jobs,
  // "where to go" and the job alerts. Kept for the shift (localStorage).
  const [itvOverride, setItvOverride] = useState<string | null>(null);
  useEffect(() => {
    try { const v = localStorage.getItem("ngm-itv-override"); if (v) setItvOverride(v.toUpperCase()); } catch { /* ignore */ }
  }, []);
  const setItv = (raw: string) => {
    const id = raw.trim().toUpperCase();
    setItvOverride(id || null);
    try { id ? localStorage.setItem("ngm-itv-override", id) : localStorage.removeItem("ngm-itv-override"); } catch { /* ignore */ }
  };
  const activeItvId = itvOverride ?? mappedVeh?.id;
  const myVeh = state.vehicles.find((v) => v.id === activeItvId) ?? mappedVeh;

  const myTrips = state.trips.filter((t) => t.driverId === state.meDriverId);
  const done = myTrips.filter((t) => t.state === "completed");
  const active = myTrips.find((t) => !["completed", "aborted", "abandoned"].includes(t.state));
  const teu = done.reduce((a, t) => a + t.teu, 0);
  const milestone = teu >= mt ? rc.milestoneBonus : 0;
  const earned = myTrips.reduce((a, t) => a + (t.earnings?.total ?? 0), 0) + milestone;
  const lastFinished = [...myTrips].reverse().find((t) => ["completed", "aborted"].includes(t.state) && t.earnings);
  const asg = activeItvId ? state.assignments[activeItvId] : undefined;

  // ── PUSH ALERT — fire when a NEW job is sent to this ITV ──────────────────────
  // The planner "sends" a job by assigning this ITV (state.assignments[myVeh.id]).
  // When that appears or changes, buzz the phone, pop a system notification, and show
  // an in-app banner. Foreground/web works now; a fully-closed-app push needs FCM +
  // the shared backend (see docs/CONNECT-APP-AND-WEB.md) to trigger the send.
  const [notifPerm, setNotifPerm] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const [jobAlert, setJobAlert] = useState<{ title: string; body: string; urgent: boolean } | null>(null);
  const jobKey = asg ? `${asg.pickup ?? ""}>${asg.target}:${asg.purpose}${asg.priority ? "!" : ""}` : "";
  const lastJobRef = useRef<string | null>(null);

  useEffect(() => {
    setNotifPerm(typeof Notification === "undefined" ? "unsupported" : (Notification.permission as "default" | "granted" | "denied"));
  }, []);

  useEffect(() => {
    // record the baseline on first run (hydration) without alerting
    if (lastJobRef.current === null) { lastJobRef.current = jobKey; return; }
    if (jobKey === lastJobRef.current) return;
    lastJobRef.current = jobKey;
    if (!jobKey) return; // job was cleared, not a new send
    const urgent = !!asg?.priority;
    const dest = `${asg?.pickup ? asg.pickup + " → " : ""}${asg?.target}`;
    const title = urgent ? "⚡ तुरंत काम · URGENT" : "नया काम · New job";
    const body = `${myVeh?.id ?? "ITV"} → ${dest} (${(asg?.purpose ?? "").replace("_", " ")})${urgent && asg?.customer ? ` · ${asg.customer}` : ""}`;
    try { navigator.vibrate?.(urgent ? [200, 100, 200, 100, 300] : [180, 90, 180]); } catch { /* no vibration API */ }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(title, { body, tag: "ng-marshal-job", requireInteraction: urgent }); } catch { /* WebView may block */ }
    }
    setJobAlert({ title, body, urgent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey]);

  // auto-dismiss the in-app banner
  useEffect(() => {
    if (!jobAlert) return;
    const t = setTimeout(() => setJobAlert(null), jobAlert.urgent ? 15000 : 8000);
    return () => clearTimeout(t);
  }, [jobAlert]);

  const enableAlerts = () => {
    if (typeof Notification === "undefined") { setNotifPerm("unsupported"); return; }
    Notification.requestPermission().then((p) => {
      setNotifPerm(p as "default" | "granted" | "denied");
      try { navigator.vibrate?.(60); } catch { /* ignore */ }
    });
  };

  // ── PRESENCE watchdog ─────────────────────────────────────────────────────────
  // He marks himself live (go on duty) / not live. While live, the app expects periodic
  // signs of life (any tap resets the clock). After PROMPT_MS of silence it beeps +
  // vibrates and asks "still there?"; if he still hasn't responded by OFFLINE_MS it
  // marks him offline (goOffDuty) so the board reflects reality. Tunable below.
  const PROMPT_MS = 20 * 60_000;   // ask after 20 min of no activity
  const OFFLINE_MS = 25 * 60_000;  // auto-offline 5 min after that
  const lastSeenRef = useRef<number>(0);
  const promptRef = useRef<boolean>(false);
  const [presencePrompt, setPresencePrompt] = useState(false);

  const beep = () => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "square"; o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination); o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 500);
    } catch { /* audio not available */ }
  };

  const iAmHere = () => { lastSeenRef.current = Date.now(); promptRef.current = false; setPresencePrompt(false); };

  useEffect(() => {
    if (!me.onDuty) { setPresencePrompt(false); promptRef.current = false; return; }
    lastSeenRef.current = Date.now();
    const mark = () => { lastSeenRef.current = Date.now(); if (promptRef.current) { promptRef.current = false; setPresencePrompt(false); } };
    window.addEventListener("pointerdown", mark);
    const id = setInterval(() => {
      const idle = Date.now() - lastSeenRef.current;
      if (idle >= OFFLINE_MS) { dispatch({ type: "goOffDuty" }); promptRef.current = false; setPresencePrompt(false); }
      else if (idle >= PROMPT_MS && !promptRef.current) { promptRef.current = true; setPresencePrompt(true); beep(); try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* ignore */ } }
    }, 15_000);
    return () => { window.removeEventListener("pointerdown", mark); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.onDuty]);

  // the ONE thing: where to go right now
  const destination = active
    ? active.movement === "export"
      ? active.state === "enroute_terminal" && active.pickup ? active.pickup : active.terminal
      : ["gate_out", "at_yard"].includes(active.state) ? "EXIM YARD" : active.terminal
    : state.offer
      ? state.offer.movement === "export" ? `${state.offer.pickup ?? "EXIM"} → ${state.offer.terminal}` : state.offer.terminal
      : asg ? `${asg.pickup ? asg.pickup + " → " : ""}${asg.target}` : null;

  const statusWord = active
    ? ({ enroute_terminal: "जाओ · GO", at_gate: "लाइन में · QUEUE", ticket_captured: "लोडिंग · LOADING", gate_out: "वापस · RETURN", at_yard: "खाली करो · OFFLOAD" } as Record<string, string>)[active.state]
    : null;

  return (
    <main className="min-h-screen bg-[#31405A] py-5 px-4 flex flex-col items-center gap-3">
      {peek && (
        <a href="/supervisor" className="w-full max-w-[390px] bg-[#E8641B] text-white text-center font-bold rounded-xl py-2.5 text-[14px]">
          ← Supervisor view पर वापस
        </a>
      )}
      <div className="w-full max-w-[390px] flex justify-between items-center text-[#B9C6DE] text-xs">
        <Link href="/" className="hover:opacity-80"><Wordmark dark compact /></Link>
        <span>{SHIFT.label}</span>
      </div>

      <div className="w-full max-w-[390px] bg-[#101A28] rounded-3xl border-[6px] border-[#060B12] shadow-2xl overflow-hidden text-[#EAF0F8]">
        {/* header — one line */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-[#2A3A50]">
          <p className="text-[13px] font-semibold">{me.nameHi}</p>
          <span className="font-mono text-[12px] font-bold bg-[#1A2739] border border-[#2A3A50] text-[#FFC08A] px-2 py-0.5 rounded">{myVeh?.id ?? "—"}</span>
        </div>

        {/* NEW-JOB ALERT — buzzes in when the planner sends this ITV a job */}
        {jobAlert && (
          <button
            onClick={() => setJobAlert(null)}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 ${jobAlert.urgent ? "bg-[#C0392B] animate-pulse" : "bg-[#1E9E5A]"} text-white`}
          >
            <span className="text-[26px] leading-none">{jobAlert.urgent ? "⚡" : "🔔"}</span>
            <span className="flex-1">
              <span className="block text-[15px] font-extrabold leading-tight">{jobAlert.title}</span>
              <span className="block text-[13px] font-semibold opacity-95">{jobAlert.body}</span>
            </span>
            <span className="text-[11px] font-bold opacity-80">✕</span>
          </button>
        )}

        {/* one-tap permission so the phone can buzz + show system alerts */}
        {notifPerm === "default" && (
          <button onClick={enableAlerts} className="w-full bg-[#22334A] text-[#FFC08A] text-[13px] font-bold py-2.5 border-b border-[#2A3A50]">
            🔔 काम के alert चालू करो · Enable job alerts
          </button>
        )}

        {/* PRESENCE check — buzzes if he's gone quiet; no reply → auto-offline */}
        {presencePrompt && (
          <button onClick={iAmHere} className="w-full bg-[#E8641B] animate-pulse text-white px-4 py-3 text-center border-b border-[#2A3A50]">
            <span className="block text-[16px] font-extrabold">क्या आप live हैं? · Still there?</span>
            <span className="block text-[13px] font-semibold opacity-95 mt-0.5">जवाब नहीं दिया तो offline हो जाओगे — दबाओ ✔ हाँ live हूँ</span>
          </button>
        )}

        <div className="p-4 flex flex-col gap-3">
          {/* OFF DUTY — one card, one slide */}
          {!me.onDuty && (
            <>
              <div className="text-center py-3">
                <p className="text-[12px] text-[#8FA0B5]">कल · Yesterday</p>
                <p className="text-[34px] font-extrabold text-[#4CD584]">₹1,360</p>
              </div>
              {/* ITV — his allocated one by default; he confirms or picks another from the
                  master list. Dropdown only — he can't type an ITV that isn't in the database. */}
              <div className="bg-[#1A2739] border border-[#2A3A50] rounded-2xl p-4">
                <p className="text-[12px] text-[#8FA0B5] mb-1">आपकी ITV · Your ITV</p>
                <select
                  value={activeItvId ?? ""}
                  onChange={(e) => setItv(e.target.value)}
                  className="w-full bg-[#101A28] border-2 border-[#2A3A50] text-[#EAF0F8] font-mono font-bold text-[22px] rounded-xl px-3 py-3 text-center appearance-none"
                >
                  <option value="" disabled>ITV चुनो · choose</option>
                  {state.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.id}{v.vendor ? ` · ${v.vendor}` : ""}</option>
                  ))}
                </select>
                <p className="text-[11px] text-[#8FA0B5] mt-1.5 text-center">
                  {mappedVeh && activeItvId === mappedVeh.id
                    ? "यही आपकी allocated ITV है — सही है तो नीचे शुरू करो"
                    : mappedVeh
                      ? <>allocated: <b className="text-[#FFC08A]">{mappedVeh.id}</b> · <button onClick={() => setItv(mappedVeh.id)} className="underline">वापस</button></>
                      : "list में से अपनी ITV चुनो"}
                </p>
              </div>
              {activeItvId ? (
                <Slide label="हाँ · ड्यूटी शुरू करो" sub={`ITV ${activeItvId}`} color="green" onClick={() => dispatch({ type: "goOnDuty" })} />
              ) : (
                <div className="bg-[#1A2739] border-2 border-[#D64545]/60 rounded-2xl p-4 text-center">
                  <p className="text-[16px] font-extrabold text-[#FF9E9E]">पहले ITV चुनो</p>
                  <p className="text-[13px] text-[#C6D2E2] mt-1">ऊपर list में से अपनी ITV select करो</p>
                </div>
              )}
            </>
          )}

          {me.onDuty && (
            <>
              {/* LIVE status — he is marked live; he can mark himself not-live (off) */}
              <div className="flex items-center justify-between bg-[#132133] border border-[#2A3A50] rounded-xl px-3 py-2">
                <span className="flex items-center gap-2 text-[13px] font-bold text-[#4CD584]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4CD584] animate-pulse" /> LIVE · {activeItvId}
                </span>
                <button onClick={() => { if (confirm("ड्यूटी बंद करें? आप offline हो जाओगे।")) dispatch({ type: "goOffDuty" }); }} className="text-[12px] font-bold text-[#FF9E9E] border border-[#D64545]/50 rounded px-2.5 py-1">
                  बंद · Off
                </button>
              </div>

              {/* MONEY — always, big */}
              <div className="text-center">
                <p className="text-[46px] leading-tight font-extrabold text-[#4CD584] tabular-nums">{fmtInr(earned)}</p>
                <p className="text-[12px] text-[#8FA0B5]">{teu} TEU {milestone > 0 && <span className="text-[#F5B94B]">· 🏆 +₹{rc.milestoneBonus}</span>}</p>
                <div className="h-2 rounded bg-[#22334A] mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#1E9E5A] to-[#4CD584] transition-all duration-700" style={{ width: `${Math.min(100, (teu / mt) * 100)}%` }} />
                </div>
                {teu < mt && (
                  <p className="text-[11px] font-mono text-[#F5B94B] mt-1">🏆 {mt - teu} TEU और → +₹{rc.milestoneBonus}</p>
                )}
              </div>

              {/* WHERE TO GO — the dominant card */}
              <div className="bg-[#1A2739] border border-[#2A3A50] rounded-2xl p-4 text-center">
                {state.offer && !active ? (
                  <>
                    <div className="flex items-center justify-center gap-3">
                      <p className="text-[30px] font-extrabold leading-tight">{destination}</p>
                      <div className="w-[52px] h-[52px] rounded-full grid place-items-center flex-none" style={{ background: `conic-gradient(#E8641B ${(state.offer.expiresIn / 60) * 360}deg, #22334A 0)` }}>
                        <span className="w-[40px] h-[40px] rounded-full bg-[#1A2739] grid place-items-center font-mono font-bold text-[12px] text-[#FFB07A]">{state.offer.expiresIn}</span>
                      </div>
                    </div>
                    <p className="text-[20px] font-extrabold text-[#4CD584] mt-1">
                      ≈ {fmtInr(rc.perTeu[state.offer.movement] * state.offer.expectedTeu + state.offer.boost)}
                      {state.offer.boost > 0 && <span className="text-[12px] text-[#FFB07A] font-bold"> ⚡+₹{state.offer.boost}</span>}
                    </p>
                  </>
                ) : active ? (
                  <>
                    <p className="text-[12px] font-bold text-[#8FA0B5]">{statusWord} · {fmtClock(state.now - active.stateSince)}</p>
                    <p className="text-[34px] font-extrabold leading-tight mt-0.5">{destination}</p>
                    {active.state === "at_gate" && <p className="text-[12px] font-mono text-[#F5B94B] mt-1">लाइन {fmtClock(active.gateWaitSec)} · auto-logged ✓</p>}
                    {active.state === "ticket_captured" && <p className="text-[13px] font-mono text-[#5CD79A] mt-1">{active.containerNo} ✓ · {fmtInr(rc.perTeu[active.movement] * active.teu + active.boost)}</p>}
                  </>
                ) : (
                  <>
                    <p className="text-[26px] font-extrabold text-[#8FA0B5]">इंतज़ार करो</p>
                    {asg && <p className="text-[13px] font-mono text-[#FFB07A] mt-1">अगला: {destination}</p>}
                  </>
                )}
              </div>

              {/* ONE action */}
              {state.offer && !active && (
                <>
                  <Slide label="स्वीकार करो" color="orange" onClick={() => dispatch({ type: "acceptOffer" })} />
                  <button onClick={() => dispatch({ type: "passOffer", reason: "driver pass" })} className="w-full text-[12px] font-semibold text-[#8FA0B5] py-1">
                    नहीं जाना · Pass ({state.passesThisShift}/3)
                  </button>
                </>
              )}
              {active?.state === "at_gate" && (
                <button onClick={() => { setShowTicket(true); setPhotoTaken(false); setTypedNo(""); }} className="w-full bg-[#E8641B] rounded-2xl py-5 text-white font-extrabold text-[19px] active:scale-[0.98]">
                  📷 पर्ची की फोटो लो
                </button>
              )}

              {/* PROBLEM — always one button */}
              <button onClick={() => setShowProblem(true)} className="w-full border-2 border-[#D64545]/60 text-[#FF9E9E] rounded-2xl py-3 text-[15px] font-bold">
                ⚠️ समस्या · Problem
              </button>

              {/* details drill-in */}
              <button onClick={() => setShowDetails(!showDetails)} className="w-full text-[12px] text-[#8FA0B5] py-1">
                और देखें · Details {showDetails ? "▴" : "▾"}
              </button>
              {showDetails && (
                <div className="flex flex-col gap-2 border-t border-[#2A3A50] pt-3">
                  {lastFinished?.earnings && (
                    <div className="bg-[#15243D] border border-[#2E5395] rounded-xl p-3 text-[11.5px] font-mono">
                      <div className="flex justify-between text-[#C6D2E2]"><span>{lastFinished.containerNo ?? "Last trip"} · {lastFinished.teu} TEU</span><span>{fmtInr(lastFinished.earnings.base)}</span></div>
                      {lastFinished.earnings.boost > 0 && <div className="flex justify-between text-[#C6D2E2]"><span>⚡ Boost</span><span>+{fmtInr(lastFinished.earnings.boost)}</span></div>}
                      <div className="flex justify-between font-bold text-white border-t border-dashed border-[#2A3A50] mt-1 pt-1"><span>Total</span><span className="text-[#5CD79A]">{fmtInr(lastFinished.earnings.total)} ✓</span></div>
                    </div>
                  )}
                  {[...done].reverse().map((t: Trip) => (
                    <div key={t.id} className="flex justify-between items-center bg-[#1A2739] border border-[#2A3A50] rounded-lg px-3 py-1.5 text-[11px]">
                      <span className="font-mono">{t.containerNo ?? `${t.terminal} · ${t.teu} TEU`}</span>
                      <span className="text-[#5CD79A] font-bold text-[10px]">{t.verification.toUpperCase()} ✓</span>
                      <span className="font-mono font-bold">{fmtInr(t.earnings?.total ?? 0)}</span>
                    </div>
                  ))}
                  <p className="text-[10.5px] font-mono text-[#8FA0B5]">Rate ₹{rc.perTeu.import}/TEU · scanning ₹{rc.perTeu.scanning} · 🏆 {mt}+ TEU = +₹{rc.milestoneBonus}</p>
                  <button onClick={() => dispatch({ type: "goOffDuty" })} className="text-[11px] text-[#8FA0B5] py-1">ड्यूटी खत्म · End shift</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* TICKET CAPTURE SHEET */}
      {showTicket && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center" onClick={() => setShowTicket(false)}>
          <div className="bg-[#101A28] border-t-2 border-[#2A3A50] rounded-t-3xl w-full max-w-[390px] p-5 pb-8 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-[14px] font-bold text-white">पर्ची · Terminal ticket</p>
            <label className={`w-full rounded-2xl py-4 text-center font-extrabold text-[17px] cursor-pointer ${photoTaken ? "bg-[#1E9E5A] text-white" : "bg-[#E8641B] text-white"}`}>
              {photoTaken ? "✓ फोटो ली गई" : "📷 फोटो लो"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) setPhotoTaken(true); }}
              />
            </label>
            <div className="flex gap-2">
              <input
                value={typedNo}
                onChange={(e) => setTypedNo(e.target.value.toUpperCase())}
                placeholder="Container no (optional)"
                className={`flex-1 bg-[#1A2739] border rounded-xl px-3 py-3 font-mono text-[14px] text-white placeholder-[#8FA0B5] outline-none ${
                  typedNo.length === 0 ? "border-[#2A3A50]" : isValidContainerNo(typedNo) ? "border-[#1E9E5A]" : "border-[#D64545]"
                }`}
                maxLength={11}
              />
              <select value={typedSize} onChange={(e) => setTypedSize(e.target.value as "20" | "40")} className="bg-[#1A2739] border border-[#2A3A50] rounded-xl px-2 text-white text-[14px]">
                <option value="20">20&apos;</option>
                <option value="40">40&apos;</option>
              </select>
            </div>
            {typedNo.length > 0 && !isValidContainerNo(typedNo) && (
              <p className="text-[11px] text-[#FF9E9E] text-center">नंबर गलत है · check digit invalid</p>
            )}
            <button
              onClick={() => {
                const valid = isValidContainerNo(typedNo);
                dispatch({
                  type: "snapTicket",
                  containerNo: valid ? typedNo.toUpperCase().replace(/[^A-Z0-9]/g, "") : undefined,
                  iso: valid ? (typedSize === "40" ? "4510" : "2210") : undefined,
                  hasPhoto: photoTaken,
                });
                setShowTicket(false);
              }}
              disabled={typedNo.length > 0 && !isValidContainerNo(typedNo)}
              className="w-full bg-[#1E9E5A] disabled:opacity-40 rounded-2xl py-3.5 text-white font-extrabold text-[16px]"
            >
              ठीक है ✓ {typedNo.length === 0 && "(OCR पढ़ेगा)"}
            </button>
            <p className="text-center text-[10.5px] text-[#8FA0B5]">फोटो से OCR खुद पढ़ लेगा · type only if photo not possible</p>
          </div>
        </div>
      )}

      {/* PROBLEM SHEET */}
      {showProblem && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center" onClick={() => setShowProblem(false)}>
          <div className="bg-[#101A28] border-t-2 border-[#2A3A50] rounded-t-3xl w-full max-w-[390px] p-5 pb-8 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-[14px] font-bold text-white mb-1">क्या समस्या है?</p>
            {[
              { label: "⏱ बहुत इंतज़ार · Long wait", act: () => dispatch({ type: "markWaiting", reason: "long wait / no parchi" }) },
              ...(active ? [
                { label: "⛔ गेट ने मना किया · Gate rejected", act: () => dispatch({ type: "gateRejected" }) },
                { label: "✕ जॉब छोड़ो · Abandon job", act: () => dispatch({ type: "abandonTrip", reason: "queue too long" }) },
              ] : []),
              { label: "🔧 गाड़ी खराब · Vehicle issue", act: () => dispatch({ type: "markWaiting", reason: "vehicle issue" }) },
            ].map((b) => (
              <button key={b.label} onClick={() => { b.act(); setShowProblem(false); }} className="w-full bg-[#1A2739] border border-[#2A3A50] rounded-xl py-3.5 text-[15px] font-bold text-[#EAF0F8]">
                {b.label}
              </button>
            ))}
            <p className="text-center text-[10.5px] text-[#8FA0B5]">फोटो अपने आप जुड़ जाएगी · photo + GPS attach automatically</p>
            <button onClick={() => setShowProblem(false)} className="text-[12px] text-[#8FA0B5] py-1">वापस · Cancel</button>
          </div>
        </div>
      )}

      {/* CELEBRATION */}
      {state.celebration && <Celebration teu={state.celebration} bonus={state.rateCard.milestoneBonus} target={mt} onClose={() => dispatch({ type: "clearCelebration" })} />}

      {/* notification toast */}
      {state.toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 bg-[#16243A] text-white text-[13px] font-semibold px-4 py-2.5 rounded-full shadow-xl border border-[#2E5395] max-w-[90vw] text-center">
          🔔 {state.toast}
        </div>
      )}
    </main>
  );
}
