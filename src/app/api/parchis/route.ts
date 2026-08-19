// Reconciliation feed — reads the parchi_photos table (service role) for one IST
// day, groups by driver, and hands back short-lived signed URLs for each image
// (the `parchis` bucket is private). Consumed by the /parchis operator view.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// "today" in IST (server runs in UTC)
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

interface Row {
  id: string; driver_id: string; driver_name: string; storage_path: string; captured_at: string;
  parchi_type: string | null; container_no: string | null; container_valid: boolean | null;
  iso_code: string | null; gate_pass_no: string | null; cycle: string | null; doc_datetime: string | null;
  vehicle_no: string | null; seal_no: string | null; transporter: string | null; ocr_at: string | null;
  size_ft: number | null; revenue: number | null; revenue_eligible: boolean | null;
}

export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get("date") || istToday();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // IST calendar day → UTC-aware bounds (captured_at is timestamptz)
  const { data, error } = await sb
    .from("parchi_photos")
    .select("id,driver_id,driver_name,storage_path,captured_at,parchi_type,container_no,container_valid,iso_code,gate_pass_no,cycle,doc_datetime,vehicle_no,seal_no,transporter,ocr_at,size_ft,revenue,revenue_eligible")
    .gte("captured_at", `${date}T00:00:00+05:30`)
    .lte("captured_at", `${date}T23:59:59+05:30`)
    .order("captured_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const signed = new Map<string, string>();
  if (rows.length) {
    const { data: urls } = await sb.storage.from("parchis").createSignedUrls(rows.map((r) => r.storage_path), 3600);
    for (const u of urls ?? []) if (u.signedUrl) signed.set(u.path!, u.signedUrl);
  }

  const groups = new Map<string, { driverId: string; driverName: string; photos: unknown[] }>();
  for (const r of rows) {
    if (!groups.has(r.driver_id)) groups.set(r.driver_id, { driverId: r.driver_id, driverName: r.driver_name, photos: [] });
    groups.get(r.driver_id)!.photos.push({
      id: r.id,
      url: signed.get(r.storage_path) ?? null,
      capturedAt: r.captured_at,
      ocr: r.ocr_at
        ? {
            parchiType: r.parchi_type, containerNo: r.container_no, containerValid: r.container_valid,
            isoCode: r.iso_code, gatePassNo: r.gate_pass_no, cycle: r.cycle, docDatetime: r.doc_datetime,
            vehicleNo: r.vehicle_no, sealNo: r.seal_no, transporter: r.transporter, ocrAt: r.ocr_at,
            sizeFt: r.size_ft, revenue: r.revenue, eligible: r.revenue_eligible,
          }
        : null,
    });
  }
  const drivers = [...groups.values()].map((g) => ({
    ...g,
    count: g.photos.length,
    revenue: g.photos.reduce((a: number, p) => a + ((p as { ocr?: { revenue?: number } }).ocr?.revenue ?? 0), 0),
  })).sort((a, b) => b.count - a.count);

  const totalRevenue = drivers.reduce((a, d) => a + d.revenue, 0);
  return NextResponse.json({ date, total: rows.length, totalRevenue, drivers });
}
