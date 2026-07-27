# NG Marshal — Auto-forward the pendency email

Goal: every ~3 hours the terminal emails the pendency; instead of someone uploading it, the email **forwards itself into the app** and the pendency updates on its own. The app already has the receiving endpoint (`/api/ingest`) — this is the wiring around it.

## The chain (how it works)
```
Adani sends pendency email  →  your mailbox auto-forwards it
   →  an inbound-email service catches it and POSTs the attachment
   →  NG Marshal /api/ingest parses it  →  pendency updates for everyone
```

## What must be in place first (one-time)
Auto-forward only works once the app is **hosted and shared**, because the email service has to reach a public URL and the data has to persist centrally:
1. **App hosted on a public URL** (Vercel).
2. **Supabase backend connected** (so ingested data is saved and shows on everyone's console). Without this, `/api/ingest` can parse but has nowhere shared to save.
3. **A secret token** set on the host: env var `INGEST_TOKEN = <some-long-random-string>`. This stops anyone else POSTing junk in.

Until these are done, keep using **⬆ Import** by hand (10 seconds). The steps below are for when you're hosted.

## Step 1 — Sign up an inbound-email service
Easiest is **CloudMailin** (free tier is plenty). Alternatives: Mailgun Routes, SendGrid Inbound Parse — same idea.
- It gives you an **inbound address** like `xxxxxxxx@cloudmailin.net`.
- Set its **target / webhook URL** to:
  `https://<your-app-domain>/api/ingest?token=<INGEST_TOKEN>`
- Set the format to **"multipart" / "attachments as files"** (so the CSV/XLSX arrives as a file, which is what the endpoint reads).

## Step 2 — Auto-forward the pendency mail from your mailbox
In the mailbox that receives the Adani pendency (e.g. the ops Gmail):
1. **Settings → Forwarding → Add a forwarding address** → paste the CloudMailin address. Gmail sends it a confirmation code; CloudMailin shows that code in its dashboard — enter it to verify.
2. **Settings → Filters → Create filter**:
   - From: the Adani sender (e.g. `opsexim.shpl@adani.com`), and/or Subject contains: `Import EXIM Movement Pendency` (adjust to the real subject).
   - Action: **Forward to** the CloudMailin address.
3. Save. (Do a separate filter for the export mail if it comes from a different sender/subject.)

That's it. The next pendency email flows straight in.

## Step 3 — Confirm it's working
- After the first real email, open the console → the **Feed snapshots** (Setup → Data & storage) or the Dashboard should show the new load, and the pendency figure updates.
- The endpoint replies with a small JSON (`+N new · updated · cleared`) that CloudMailin logs — useful if something doesn't map.

## Notes for the import feed specifically
- The DPD import CSV comes as an **attachment** — the endpoint reads `.csv/.xlsx/.xls` attachments directly, detects it's import, and reconciles it exactly like a manual upload (added / updated / cleared).
- If a mail ever arrives with the data **inline in the body** instead of attached, tell us — that needs a small tweak to read the body.
- Direction (import vs export) is taken from the filename/columns; if two feeds share a look-alike format we can pin each forwarder to a fixed type.

## Who does what
- **You / your IT:** host on Vercel + Supabase, set `INGEST_TOKEN`, sign up CloudMailin, add the Gmail forward rule.
- **Us:** the `/api/ingest` endpoint is built and tested; we'll help wire the token and confirm the first live email parses correctly.
