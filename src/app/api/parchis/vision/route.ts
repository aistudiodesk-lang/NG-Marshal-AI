// Server-side parchi reader. Given a parchi_photos id, it downloads the image from the
// private `parchis` bucket (service role), reads it with Gemini vision, computes revenue,
// and saves the fields back onto the row. Called by BOTH the driver app (right after upload)
// and the /parchis office page ("OCR करो"). The Gemini key stays server-side; no APK rebuild.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractParchiFields } from "@/lib/gemini";
import { computeRevenue } from "@/lib/revenue";
import { isValidContainer } from "@/lib/parchiOcr";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Gemini vision call can take a few seconds

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // find the image
  const { data: row, error: rowErr } = await sb
    .from("parchi_photos")
    .select("storage_path")
    .eq("id", body.id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: rowErr?.message || "not found" }, { status: 404 });

  // download the private image bytes → base64
  const { data: blob, error: dlErr } = await sb.storage.from("parchis").download(row.storage_path as string);
  if (dlErr || !blob) return NextResponse.json({ error: dlErr?.message || "download failed" }, { status: 500 });
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "image/jpeg";

  // read it with Gemini
  let fields, raw;
  try {
    ({ fields, raw } = await extractParchiFields(buf.toString("base64"), mime));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "vision failed" }, { status: 502 });
  }

  // revenue = single source of truth (parchi type + ISO code)
  const rev = computeRevenue(fields.parchiType, fields.isoCode);

  const patch = {
    parchi_type: fields.parchiType ?? null,
    container_no: fields.containerNo ?? null,
    container_valid: fields.containerNo ? isValidContainer(fields.containerNo) : null,
    iso_code: fields.isoCode ?? null,
    gate_pass_no: fields.gatePassNo ?? null,
    cycle: fields.cycle ?? null,
    doc_datetime: fields.docDatetime ?? null,
    vehicle_no: fields.vehicleNo ?? null,
    seal_no: fields.sealNo ?? null,
    transporter: fields.transporter ?? null,
    size_ft: rev.sizeFt,
    revenue: rev.revenue,
    revenue_eligible: rev.eligible,
    ocr_raw: raw,
    ocr_at: new Date().toISOString(),
  };
  const { error: upErr } = await sb.from("parchi_photos").update(patch).eq("id", body.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    fields,
    revenue: rev.revenue,
    sizeFt: rev.sizeFt,
    eligible: rev.eligible,
  });
}
