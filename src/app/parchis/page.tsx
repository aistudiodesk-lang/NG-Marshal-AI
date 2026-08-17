"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Wordmark } from "@/components/Brand";

// Reconciliation view (for US, not drivers): how many parchis each driver captured
// on a given day, with the actual photos. Reads /api/parchis (service-role + signed URLs).

interface Photo { url: string | null; capturedAt: string }
interface DriverGroup { driverId: string; driverName: string; count: number; photos: Photo[] }
interface Feed { date: string; total: number; drivers: DriverGroup[] }

const istDate = () => new Date().toLocaleDateString("en-CA"); // device is IST → YYYY-MM-DD
const istTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function ParchisPage() {
  const [date, setDate] = useState(istDate());
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/parchis?date=${d}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "load failed");
      setFeed(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load failed");
      setFeed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  return (
    <main className="min-h-screen bg-[#EDF0F4] text-[#16243A]">
      <header className="bg-[#16243A] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link href="/?stay=1" className="hover:opacity-80"><Wordmark dark compact /></Link>
        <span className="text-[13px] font-bold text-[#B9C6DE]">पर्ची कलेक्शन</span>
      </header>

      <div className="max-w-[900px] mx-auto p-4 flex flex-col gap-4">
        {/* controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={date}
            max={istDate()}
            onChange={(e) => setDate(e.target.value)}
            className="bg-white border border-[#CBD5E3] rounded-lg px-3 py-2 text-[14px] font-semibold"
          />
          <button onClick={() => load(date)} className="bg-[#2E5395] text-white rounded-lg px-4 py-2 text-[13px] font-bold active:scale-[0.98]">
            {loading ? "…" : "↻ ताज़ा करो"}
          </button>
          {feed && (
            <span className="ml-auto text-[15px] font-extrabold">
              कुल <span className="text-[#1E9E5A]">{feed.total}</span> पर्ची · {feed.drivers.length} ड्राइवर
            </span>
          )}
        </div>

        {err && <p className="text-[#C0392B] font-semibold text-[14px]">✕ {err}</p>}
        {feed && !loading && feed.total === 0 && (
          <p className="text-[#5C6B80] text-[15px] py-10 text-center">इस दिन कोई पर्ची कैप्चर नहीं हुई.</p>
        )}

        {/* per-driver */}
        {feed?.drivers.map((d) => (
          <section key={d.driverId} className="bg-white rounded-2xl border border-[#DCE3EC] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#EDF0F4]">
              <span className="font-extrabold text-[16px]">{d.driverName}</span>
              <span className="bg-[#1E9E5A] text-white text-[13px] font-extrabold rounded-full px-3 py-1">{d.count} पर्ची</span>
            </div>
            <div className="p-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {d.photos.map((p, i) => (
                <a key={i} href={p.url ?? "#"} target="_blank" rel="noreferrer" className="block relative aspect-[3/4] rounded-lg overflow-hidden bg-[#EDF0F4] border border-[#DCE3EC]">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="parchi" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] text-[#8FA0B5]">no image</span>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-[10px] font-bold text-center py-0.5">{istTime(p.capturedAt)}</span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
