"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Wordmark } from "@/components/Brand";
import { isValidContainer } from "@/lib/parchiOcr";
import { ocrImage } from "@/lib/parchiOcrClient";

// Reconciliation view (for US, not drivers): per-driver parchi counts + the photos,
// with on-demand Tesseract OCR (runs in THIS browser) to pull the container no,
// parchi type, cycle, date, vehicle & seal. Fields are editable + saved back to the DB.

interface Ocr {
  parchiType?: string | null; containerNo?: string | null; containerValid?: boolean | null;
  isoCode?: string | null; gatePassNo?: string | null; cycle?: string | null; docDatetime?: string | null;
  vehicleNo?: string | null; sealNo?: string | null; transporter?: string | null; ocrAt?: string | null;
  sizeFt?: number | null; revenue?: number | null; eligible?: boolean | null;
}
interface Photo { id: string; url: string | null; capturedAt: string; ocr: Ocr | null }
interface DriverGroup { driverId: string; driverName: string; count: number; revenue: number; photos: Photo[] }
interface Feed { date: string; total: number; totalRevenue: number; drivers: DriverGroup[] }

interface FieldSet { parchiType: string; containerNo: string; isoCode: string; cycle: string; docDatetime: string; vehicleNo: string; gatePassNo: string; sealNo: string; transporter: string }
const EMPTY: FieldSet = { parchiType: "", containerNo: "", isoCode: "", cycle: "", docDatetime: "", vehicleNo: "", gatePassNo: "", sealNo: "", transporter: "" };
const fromOcr = (o: Ocr): FieldSet => ({
  parchiType: o.parchiType ?? "", containerNo: o.containerNo ?? "", isoCode: o.isoCode ?? "", cycle: o.cycle ?? "", docDatetime: o.docDatetime ?? "",
  vehicleNo: o.vehicleNo ?? "", gatePassNo: o.gatePassNo ?? "", sealNo: o.sealNo ?? "", transporter: o.transporter ?? "",
});

const istDate = () => new Date().toLocaleDateString("en-CA");
const istTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function ParchisPage() {
  const [date, setDate] = useState(istDate());
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [edits, setEdits] = useState<Record<string, FieldSet>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [revById, setRevById] = useState<Record<string, number>>({});
  const [bulk, setBulk] = useState<{ on: boolean; done: number; total: number }>({ on: false, done: 0, total: 0 });

  const load = useCallback(async (d: string) => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/parchis?date=${d}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "load failed");
      setFeed(j);
      // seed editable fields from any already-extracted rows
      const seed: Record<string, FieldSet> = {};
      for (const dr of j.drivers as DriverGroup[]) for (const p of dr.photos) if (p.ocr) seed[p.id] = fromOcr(p.ocr);
      setEdits(seed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load failed"); setFeed(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const save = useCallback(async (id: string, fs: FieldSet, raw?: string) => {
    const fields = { ...fs, containerValid: isValidContainer(fs.containerNo) };
    const res = await fetch("/api/parchis/extract", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fields, raw }),
    });
    const j = await res.json().catch(() => ({}));
    if (typeof j.revenue === "number") setRevById((m) => ({ ...m, [id]: j.revenue }));
    setSaved((s) => ({ ...s, [id]: true }));
    setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 1800);
  }, []);

  const runOcr = useCallback(async (photo: Photo) => {
    if (!photo.url) return;
    setBusy((b) => ({ ...b, [photo.id]: true }));
    try {
      const { raw, fields } = await ocrImage(photo.url);
      const fs: FieldSet = {
        parchiType: fields.parchiType ?? "", containerNo: fields.containerNo ?? "", isoCode: fields.isoCode ?? "",
        cycle: fields.cycle ?? "", docDatetime: fields.docDatetime ?? "", vehicleNo: fields.vehicleNo ?? "",
        gatePassNo: fields.gatePassNo ?? "", sealNo: fields.sealNo ?? "", transporter: fields.transporter ?? "",
      };
      setEdits((e) => ({ ...e, [photo.id]: fs }));
      await save(photo.id, fs, raw);
    } catch (e) {
      setErr(`OCR fail: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy((b) => ({ ...b, [photo.id]: false }));
    }
  }, [save]);

  const extractAll = useCallback(async () => {
    if (!feed) return;
    const todo = feed.drivers.flatMap((d) => d.photos).filter((p) => p.url && !edits[p.id]);
    setBulk({ on: true, done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      await runOcr(todo[i]);
      setBulk({ on: true, done: i + 1, total: todo.length });
    }
    setBulk({ on: false, done: 0, total: 0 });
  }, [feed, edits, runOcr]);

  const setField = (id: string, k: keyof FieldSet, v: string) =>
    setEdits((e) => ({ ...e, [id]: { ...(e[id] ?? EMPTY), [k]: v } }));

  const pendingCount = feed ? feed.drivers.flatMap((d) => d.photos).filter((p) => p.url && !edits[p.id]).length : 0;

  return (
    <main className="min-h-screen bg-[#EDF0F4] text-[#16243A]">
      <header className="bg-[#16243A] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link href="/?stay=1" className="hover:opacity-80"><Wordmark dark compact /></Link>
        <span className="text-[13px] font-bold text-[#B9C6DE]">पर्ची कलेक्शन + OCR</span>
      </header>

      <div className="max-w-[1000px] mx-auto p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input type="date" value={date} max={istDate()} onChange={(e) => setDate(e.target.value)}
            className="bg-white border border-[#CBD5E3] rounded-lg px-3 py-2 text-[14px] font-semibold" />
          <button onClick={() => load(date)} className="bg-[#2E5395] text-white rounded-lg px-4 py-2 text-[13px] font-bold active:scale-[0.98]">
            {loading ? "…" : "↻ ताज़ा"}
          </button>
          {pendingCount > 0 && (
            <button onClick={extractAll} disabled={bulk.on}
              className="bg-[#E8641B] disabled:opacity-50 text-white rounded-lg px-4 py-2 text-[13px] font-bold active:scale-[0.98]">
              {bulk.on ? `OCR ${bulk.done}/${bulk.total}…` : `🔍 बाकी ${pendingCount} की OCR करो`}
            </button>
          )}
          {feed && (
            <span className="ml-auto text-[15px] font-extrabold flex items-center gap-3">
              <span>कुल <span className="text-[#1E9E5A]">{feed.total}</span> पर्ची</span>
              <span className="bg-[#FFF3D6] text-[#8A5A00] rounded-lg px-2.5 py-1">💰 ₹{feed.totalRevenue}</span>
            </span>
          )}
        </div>

        {err && <p className="text-[#C0392B] font-semibold text-[13px]">✕ {err}</p>}
        {feed && !loading && feed.total === 0 && <p className="text-[#5C6B80] py-10 text-center">इस दिन कोई पर्ची नहीं.</p>}

        {feed?.drivers.map((d) => (
          <section key={d.driverId} className="bg-white rounded-2xl border border-[#DCE3EC] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#EDF0F4]">
              <span className="font-extrabold text-[16px]">{d.driverName}</span>
              <span className="flex items-center gap-2">
                <span className="bg-[#FFF3D6] text-[#8A5A00] text-[13px] font-extrabold rounded-full px-3 py-1">💰 ₹{d.revenue}</span>
                <span className="bg-[#1E9E5A] text-white text-[13px] font-extrabold rounded-full px-3 py-1">{d.count} पर्ची</span>
              </span>
            </div>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {d.photos.map((p) => (
                <PhotoCard
                  key={p.id} photo={p} fields={edits[p.id]} busy={!!busy[p.id]} saved={!!saved[p.id]}
                  revenue={revById[p.id] ?? p.ocr?.revenue ?? null}
                  onExtract={() => runOcr(p)}
                  onField={(k, v) => setField(p.id, k, v)}
                  onSave={() => edits[p.id] && save(p.id, edits[p.id])}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function Field({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold text-[#8FA0B5] uppercase tracking-wide">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className={`bg-[#F5F7FA] border border-[#DCE3EC] rounded-md px-2 py-1.5 text-[13px] ${mono ? "font-mono" : ""}`} />
    </label>
  );
}

function PhotoCard({ photo, fields, busy, saved, revenue, onExtract, onField, onSave }: {
  photo: Photo; fields?: FieldSet; busy: boolean; saved: boolean; revenue: number | null;
  onExtract: () => void; onField: (k: keyof FieldSet, v: string) => void; onSave: () => void;
}) {
  const valid = fields ? isValidContainer(fields.containerNo) : false;
  return (
    <div className="flex gap-3 border border-[#EDF0F4] rounded-xl p-2 bg-[#FBFCFD]">
      {/* thumbnail */}
      <a href={photo.url ?? "#"} target="_blank" rel="noreferrer"
        className="block relative w-24 shrink-0 aspect-[3/4] rounded-lg overflow-hidden bg-[#EDF0F4] border border-[#DCE3EC]">
        {photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="parchi" className="w-full h-full object-cover" loading="lazy" />
        ) : <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[#8FA0B5]">no image</span>}
        <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-bold text-center py-0.5">{istTime(photo.capturedAt)}</span>
      </a>

      {/* fields / extract */}
      <div className="flex-1 min-w-0">
        {!fields ? (
          <button onClick={onExtract} disabled={busy}
            className="w-full h-full min-h-[120px] rounded-lg border-2 border-dashed border-[#CBD5E3] text-[#2E5395] font-bold text-[14px] disabled:opacity-60">
            {busy ? "OCR चल रहा है…" : "🔍 OCR करो"}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Field label="Container No" value={fields.containerNo} onChange={(v) => onField("containerNo", v.toUpperCase())} mono />
              </div>
              <span className={`mt-3 text-[11px] font-extrabold px-2 py-1 rounded ${valid ? "bg-[#1E9E5A] text-white" : "bg-[#FBE3E3] text-[#C0392B]"}`}>
                {valid ? "✓ valid" : "⚠ check"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type" value={fields.parchiType} onChange={(v) => onField("parchiType", v)} />
              <Field label="ISO / Size" value={fields.isoCode} onChange={(v) => onField("isoCode", v.toUpperCase())} mono />
              <Field label="Cycle" value={fields.cycle} onChange={(v) => onField("cycle", v.toUpperCase())} />
              <Field label="Date/Time" value={fields.docDatetime} onChange={(v) => onField("docDatetime", v)} />
              <Field label="Gate Pass" value={fields.gatePassNo} onChange={(v) => onField("gatePassNo", v)} mono />
              <Field label="Vehicle" value={fields.vehicleNo} onChange={(v) => onField("vehicleNo", v.toUpperCase())} mono />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onSave} className="bg-[#1E9E5A] text-white rounded-md px-3 py-1.5 text-[12px] font-bold">
                {saved ? "✓ saved" : "सेव करो"}
              </button>
              <button onClick={onExtract} disabled={busy} className="text-[#2E5395] rounded-md px-2 py-1.5 text-[12px] font-bold border border-[#CBD5E3] disabled:opacity-60">
                {busy ? "…" : "↻ फिर OCR"}
              </button>
              <span className={`ml-auto text-[13px] font-extrabold px-2.5 py-1 rounded ${revenue ? "bg-[#FFF3D6] text-[#8A5A00]" : "bg-[#EDF0F4] text-[#8FA0B5]"}`}>
                {revenue ? `💰 ₹${revenue}` : "₹0"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
