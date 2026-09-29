// Driver roster only — the login dropdown needs just names, not the multi-MB site_state blob
// (on a phone that blob can take 15s+ or fail, leaving the seed list on screen).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SITE } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.from("site_state").select("drivers:state->drivers").eq("site_id", SITE.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const drivers = ((data?.drivers ?? []) as { id: string; name: string; nameHi?: string }[])
    .map((d) => ({ id: d.id, name: d.name, nameHi: d.nameHi || d.name }));
  return NextResponse.json({ drivers });
}
