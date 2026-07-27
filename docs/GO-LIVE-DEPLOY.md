# NG Marshal — Go live (host it so the team can use it)

Result: a web link (e.g. `https://ng-marshal.vercel.app`) that anyone on the team opens, with **shared live data** that persists centrally. ~20–30 minutes, done once. You'll need a GitHub login (you have it) — Supabase and Vercel both sign in with GitHub.

There are **two services**, both free:
- **Supabase** = the shared database (where the data lives).
- **Vercel** = the hosting (runs the app + the auto-forward endpoint).

Do Supabase first (Vercel needs its keys).

---

## PART A — Supabase (the shared database) · ~10 min

1. Go to **supabase.com** → **Sign in** (use *Continue with GitHub*).
2. **New project**:
   - Name: `ng-marshal`
   - Database password: click *Generate*, then **copy & save it** somewhere (you rarely need it, but keep it).
   - Region: **Mumbai / ap-south-1** (closest).
   - Create. Wait ~2 minutes while it provisions.
3. Left sidebar → **SQL Editor** → **New query**. Open the file `db/migrations/001_init.sql` from the repo, copy **all** of it, paste, and click **Run** (bottom-right). It should say *Success*.
4. New query again → paste **all** of `db/migrations/002_equipment.sql` → **Run**.
5. Left sidebar → **Project Settings** (gear) → **API**. Copy these three (keep the tab open):
   - **Project URL** — like `https://abcdxyz.supabase.co`
   - **anon public** key — a long string
   - **service_role** key — another long string (this one is secret; scroll down / click *Reveal*)

That's Supabase done.

---

## PART B — Vercel (hosting) · ~10 min

1. Go to **vercel.com** → **Sign in** (*Continue with GitHub*).
2. **Add New… → Project** → find **`tGainR/NG-Marshal`** → **Import**.
   *(If you don't see it, click "Adjust GitHub App Permissions" and give Vercel access to that repo.)*
3. Leave **Framework Preset = Next.js** and **Root Directory = ./** (the app is at the repo root — don't change it).
4. Expand **Environment Variables** and add these five (Name = Value):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_BACKEND` | `supabase` |
   | `NEXT_PUBLIC_SUPABASE_URL` | *(the Project URL from Supabase)* |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(the anon public key)* |
   | `SUPABASE_SERVICE_ROLE_KEY` | *(the service_role key)* |
   | `INGEST_TOKEN` | *(make up a long random string — for auto-forward later)* |

5. Click **Deploy**. Wait ~2 minutes. You get a live URL — that's the app.

---

## PART C — First run (5 min)

1. Open the Vercel URL → the console loads (empty — no seed data on a fresh DB).
2. **⬆ Import** → load your **ITV master** and **Driver master**, then today's **Import pendency** and **Export**.
3. Open the same URL on another laptop/phone → you'll see the **same data**. That confirms the shared database is working.
4. From now on: everyone works on this one link; the **↻ Refresh** button (and an automatic 4-second poll) pulls each other's latest changes.

---

## PART D — Before you let drivers in (do soon, not required for the HO pilot)

- The link is unlisted but has **no login yet**. For the HO planning desk that's fine to start. Before drivers use the mobile app widely, add **phone-OTP login** (a ~half-day job — tell us and we'll wire it with Supabase Auth).
- **Auto-forward the pendency email**: once hosted, follow `AUTO-FORWARD-SETUP.md` — point CloudMailin at `https://<your-url>/api/ingest?token=<INGEST_TOKEN>` and add the Gmail forward rule.

---

## Gotchas / notes
- **Root Directory stays `./`** — the Next app is the repo root, not a subfolder.
- If the build fails, open the Vercel build log; 99% of the time it's a missing/typo'd env var — fix it under Project → Settings → Environment Variables and **Redeploy**.
- Two people editing at once is safe: the app uses an optimistic-lock (`rev`) — if two saves collide, the second re-pulls and re-applies, no data lost.
- **To update the app later:** you or your teammate just push to GitHub `main` → Vercel auto-redeploys the URL in ~2 min. No manual step.
- Custom domain (e.g. `marshal.navingroup.in`) can be added later in Vercel → Settings → Domains.

## Who does what
- **You / teammate:** the clicks above (your GitHub/Supabase/Vercel accounts).
- **Us:** the code, the DB schema, and the endpoints are all ready and tested; ping us if any env var or the first import doesn't behave and we'll sort it live.
