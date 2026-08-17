// Save extracted/edited parchi fields onto a parchi_photos row (service role).
// Called by the /parchis page after browser OCR, and again if the operator edits a field.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface Fields {
  parchiType?: string; containerNo?: string; containerValid?: boolean; gatePassNo?: string;
  cycle?: string; docDatetime?: string; vehicleNo?: string; sealNo?: string; transporter?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { id?: string; fields?: Fields; raw?: string };
  if (!body.id || !body.fields) return NextResponse.json({ error: "id and fields required" }, { status: 400 });
  const f = body.fields;

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const patch: Record<string, unknown> = {
    parchi_type: f.parchiType ?? null,
    container_no: f.containerNo ?? null,
    container_valid: f.containerValid ?? null,
    gate_pass_no: f.gatePassNo ?? null,
    cycle: f.cycle ?? null,
    doc_datetime: f.docDatetime ?? null,
    vehicle_no: f.vehicleNo ?? null,
    seal_no: f.sealNo ?? null,
    transporter: f.transporter ?? null,
    ocr_at: new Date().toISOString(),
  };
  // only touch raw text when we actually ran OCR (manual field edits leave it intact)
  if (body.raw !== undefined) patch.ocr_raw = body.raw;

  const { error } = await sb.from("parchi_photos").update(patch).eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
