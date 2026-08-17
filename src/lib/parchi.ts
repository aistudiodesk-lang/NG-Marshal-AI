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

// Phone cameras shoot 8–12 MB photos — far bigger than a readable parchi needs.
// Downscale to ~1600px / JPEG 0.7 in the browser BEFORE upload (parchi text stays
// crisp, file drops to ~200–400 KB). Never lose a capture: any failure → original file.
async function compressImage(file: File): Promise<Blob> {
  const MAX = 1600, QUALITY = 0.7;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Upload one parchi photo (compressed). Path: <driverId>/<YYYY-MM-DD>/<ts>.<ext>. Throws on failure. */
export async function uploadParchi(file: File, driverId: string, driverName: string): Promise<string> {
  const now = new Date();
  const blob = await compressImage(file);
  const compressed = blob !== file; // compress() returns a fresh jpeg blob on success
  const ext = compressed ? "jpg" : ((file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg");
  const contentType = compressed ? "image/jpeg" : (file.type || "image/jpeg");
  const path = `${driverId}/${now.toISOString().slice(0, 10)}/${now.getTime()}.${ext}`;

  const { error: upErr } = await sb()
    .storage.from("parchis")
    .upload(path, blob, { contentType, upsert: false });
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
