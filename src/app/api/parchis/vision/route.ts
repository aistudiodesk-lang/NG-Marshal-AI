// Server-side parchi reader. The photo is READ by the fine-tuned model on the office Mac mini
// (Qwen3.5-4B, ~10 s per photo), not by Gemini. The Mac can't be called from Vercel, so it
// works the other way round: it watches parchi_photos for rows with ocr_at = null, reads them,
// and writes the fields + revenue (same columns and same computeRevenue rule as before) and
// runs the manual-entry cross-check. This route only asks for a read and waits for it.
// Called by BOTH the driver app (right after upload) and the /parchis office page.
// Response shape is unchanged, so neither caller needed to change.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // wait up to ~55 s for the Mac reader

const WAIT_MS = 55_000;
const POLL_MS = 1_500;

const COLS =
  "ocr_at,parchi_type,container_no,iso_code,gate_pass_no,cycle,doc_datetime,vehicle_no,seal_no,transporter," +
  "size_ft,revenue,revenue_eligible,approved_by";

const str = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: row, error: rowErr } = await sb.from("parchi_photos").select("ocr_at").eq("id", body.id).single();
  if (rowErr || !row) return NextResponse.json({ error: rowErr?.message || "not found" }, { status: 404 });

  // Already read → this is a re-read request ("↻ फिर OCR"): clear ocr_at so the Mac reads it again.
  if (row.ocr_at) {
    const { error } = await sb.from("parchi_photos").update({ ocr_at: null }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Wait for the Mac reader to fill the row.
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const { data } = await sb.from("parchi_photos").select(COLS).eq("id", body.id).single();
    const r = data as Record<string, unknown> | null;
    if (r?.ocr_at) {
      return NextResponse.json({
        ok: true,
        reader: "mac",
        autoApproved: String(r.approved_by ?? "").startsWith("auto"),
        fields: {
          parchiType: str(r.parchi_type),
          containerNo: str(r.container_no),
          isoCode: str(r.iso_code),
          gatePassNo: str(r.gate_pass_no),
          cycle: str(r.cycle),
          docDatetime: str(r.doc_datetime),
          vehicleNo: str(r.vehicle_no),
          sealNo: str(r.seal_no),
          transporter: str(r.transporter),
        },
        revenue: r.revenue ?? 0,
        sizeFt: r.size_ft ?? null,
        eligible: !!r.revenue_eligible,
      });
    }
  }

  // Not read in time (Mac busy, training, or offline). The photo is saved and stays queued;
  // the Mac reads it as soon as it can and the revenue shows up on the next refresh.
  return NextResponse.json(
    { error: "Mac reader is busy — this parchi is queued and will be read automatically", pending: true },
    { status: 504 },
  );
}
