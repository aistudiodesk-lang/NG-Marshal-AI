// Auto-ingest of the Adani EXIM pendency feed straight from Gmail.
// Every few minutes a scheduler hits /api/gmail-sync → this runs:
//   Composio GMAIL_FETCH_EMAILS (Adani sender, with attachments)
//     → GMAIL_GET_ATTACHMENT (presigned s3url) → download the CSV/XLSX bytes
//     → same importer + reconcile the console/ upload uses → shared pool updates.
// A checkpoint (last processed Gmail internalDate) lives in site_state.state.gmailCheckpoint
// so the same email is never re-ingested on the next tick.
import { createClient } from "@supabase/supabase-js";
import { composioExecute } from "@/lib/composio";
import {
  parseBuffer,
  guessKind,
  extractContainers,
  ImportedContainer,
  reconcilePool,
  parseFeedTimestamp,
} from "@/lib/importer";

const SITE_ID = "mundra-exim";
// Only mail from the terminal's MIS desk is ever ingested.
const ADANI_SENDER = "misexim.shpl@adani.com";
const FETCH_QUERY = `from:${ADANI_SENDER} has:attachment`;

type GmailAttachment = {
  filename?: string;
  name?: string;
  attachmentId?: string;
  attachment_id?: string;
  id?: string;
  mimeType?: string;
};
type GmailMessage = {
  messageId: string;
  threadId?: string;
  subject?: string;
  sender?: string;
  messageTimestamp?: string;
  internalDate?: string;
  attachmentList?: GmailAttachment[];
  attachments?: GmailAttachment[];
};

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Picks the real data file out of the attachment list (skips image001.jpg etc.).
function pickDataAttachment(m: GmailMessage): GmailAttachment | null {
  const list = m.attachmentList ?? m.attachments ?? [];
  for (const a of list) {
    const name = a.filename ?? a.name ?? "";
    if (/\.(csv|xlsx?|xls)$/i.test(name)) return a;
  }
  return null;
}

async function downloadAttachment(
  messageId: string,
  att: GmailAttachment,
  filename: string
): Promise<ArrayBuffer | null> {
  const attId = att.attachmentId ?? att.attachment_id ?? att.id;
  if (!attId) return null;
  const res = await composioExecute("GMAIL_GET_ATTACHMENT", {
    message_id: messageId,
    attachment_id: attId,
    file_name: filename,
  });
  const url = res?.file?.s3url as string | undefined;
  if (!url) return null;
  const dl = await fetch(url);
  if (!dl.ok) return null;
  return dl.arrayBuffer();
}

type ReconResult = { added: number; updated: number; cleared: number };

// One file → parsed → reconciled into the shared snapshot, with the same
// optimistic-locking + isNewest semantics as the manual /api/ingest upload.
// Also advances gmailCheckpoint to this email's timestamp in the same write.
async function reconcileFile(
  client: ReturnType<typeof sb>,
  containers: ImportedContainer[],
  direction: "import" | "export",
  filename: string,
  msgTs: number
): Promise<ReconResult | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await client
      .from("site_state")
      .select("rev,state")
      .eq("site_id", SITE_ID)
      .maybeSingle();
    if (!data) return null;
    const state = data.state as {
      pool?: ImportedContainer[];
      history?: never[];
      lastFeedAt?: Record<string, number>;
      gmailCheckpoint?: number;
    } & Record<string, unknown>;

    const feedAt = Number.isNaN(parseFeedTimestamp(filename))
      ? Date.now()
      : parseFeedTimestamp(filename);
    const prevNewest = state.lastFeedAt?.[direction] ?? 0;
    const isNewest = feedAt >= prevNewest;
    const { pool, history, added, updated, cleared } = reconcilePool(
      state.pool ?? [],
      containers,
      direction,
      filename,
      feedAt,
      isNewest,
      state.history ?? []
    );
    const next = {
      ...state,
      pool,
      history: [...history, ...(state.history ?? [])].slice(0, 40000),
      lastFeedAt: isNewest
        ? { ...(state.lastFeedAt ?? {}), [direction]: feedAt }
        : state.lastFeedAt,
      gmailCheckpoint: Math.max(state.gmailCheckpoint ?? 0, msgTs),
    };
    const { data: upd } = await client
      .from("site_state")
      .update({
        rev: Number(data.rev) + 1,
        state: next,
        updated_at: new Date().toISOString(),
      })
      .eq("site_id", SITE_ID)
      .eq("rev", data.rev)
      .select("rev");
    if (upd && upd.length > 0) return { added, updated, cleared };
    // rev conflict (a console user or another tick wrote) → retry
  }
  return null;
}

// Bumps the checkpoint past messages we considered but skipped (no data file),
// so they aren't re-listed forever.
async function bumpCheckpoint(client: ReturnType<typeof sb>, ts: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await client
      .from("site_state")
      .select("rev,state")
      .eq("site_id", SITE_ID)
      .maybeSingle();
    if (!data) return;
    const state = data.state as { gmailCheckpoint?: number } & Record<string, unknown>;
    if ((state.gmailCheckpoint ?? 0) >= ts) return; // already ahead
    const { data: upd } = await client
      .from("site_state")
      .update({
        rev: Number(data.rev) + 1,
        state: { ...state, gmailCheckpoint: ts },
        updated_at: new Date().toISOString(),
      })
      .eq("site_id", SITE_ID)
      .eq("rev", data.rev)
      .select("rev");
    if (upd && upd.length > 0) return;
  }
}

export type GmailSyncResult = {
  scanned: number;
  considered: number;
  ingested: number;
  skipped: number;
  files: { filename: string; direction: string; added: number; updated: number; cleared: number }[];
};

export async function runGmailSync(): Promise<GmailSyncResult> {
  const client = sb();

  const { data: row } = await client
    .from("site_state")
    .select("state")
    .eq("site_id", SITE_ID)
    .maybeSingle();
  const checkpoint = Number(
    (row?.state as { gmailCheckpoint?: number } | undefined)?.gmailCheckpoint ?? 0
  );

  const data = await composioExecute("GMAIL_FETCH_EMAILS", {
    query: FETCH_QUERY,
    max_results: 25,
    verbose: true,
  });
  const messages: GmailMessage[] = data?.messages ?? [];

  // Oldest first so isNewest / clearing advances in the right order.
  const queue = messages
    .map((m) => ({
      m,
      ts: Date.parse(m.messageTimestamp ?? m.internalDate ?? "") || 0,
    }))
    .filter((x) => x.ts > checkpoint)
    .sort((a, b) => a.ts - b.ts);

  let ingested = 0;
  let skipped = 0;
  let maxTs = checkpoint;
  const files: GmailSyncResult["files"] = [];

  for (const { m, ts } of queue) {
    maxTs = Math.max(maxTs, ts);
    const att = pickDataAttachment(m);
    if (!att) {
      skipped++;
      continue;
    }
    const filename = att.filename ?? att.name ?? "attachment.csv";
    const buf = await downloadAttachment(m.messageId, att, filename);
    if (!buf || buf.byteLength === 0) {
      skipped++;
      continue;
    }
    const sheets = parseBuffer(buf);
    const containers: ImportedContainer[] = sheets
      .filter((s) => guessKind(s) === "container_pool")
      .flatMap((s) => extractContainers(s, filename));
    if (containers.length === 0) {
      skipped++;
      continue;
    }
    const direction = containers[0].direction;
    const res = await reconcileFile(client, containers, direction, filename, ts);
    if (res) {
      ingested++;
      files.push({ filename, direction, ...res });
    } else {
      skipped++;
    }
  }

  if (maxTs > checkpoint) await bumpCheckpoint(client, maxTs);

  return {
    scanned: messages.length,
    considered: queue.length,
    ingested,
    skipped,
    files,
  };
}
