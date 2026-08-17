"use client";

// Parchi photo capture → Supabase Storage (bucket `parchis`) + metadata row
// (`parchi_photos`). The driver app's ONLY job: collect pictures with a timestamp
// so we can reconcile how many were captured vs. how many a route should produce.
// No OCR here — that comes later. Own supabase client (anon key), isolated to this file.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return client;
}

/** Upload one parchi photo. Path: <driverId>/<YYYY-MM-DD>/<ts>.<ext>. Throws on failure. */
export async function uploadParchi(file: File, driverId: string, driverName: string): Promise<string> {
  const now = new Date();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${driverId}/${now.toISOString().slice(0, 10)}/${now.getTime()}.${ext}`;

  const { error: upErr } = await sb()
    .storage.from("parchis")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { error: insErr } = await sb()
    .from("parchi_photos")
    .insert({ driver_id: driverId, driver_name: driverName, storage_path: path, captured_at: now.toISOString() });
  if (insErr) throw new Error(insErr.message);

  return path;
}

/** How many parchis this driver captured today — survives app reloads. */
export async function countToday(driverId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count, error } = await sb()
    .from("parchi_photos")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driverId)
    .gte("captured_at", start.toISOString());
  if (error) return 0;
  return count ?? 0;
}
