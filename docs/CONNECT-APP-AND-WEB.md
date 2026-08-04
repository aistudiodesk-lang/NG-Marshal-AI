# Connecting the App and the Web Console (shared data)

**The problem.** By default both the web console and the Android APK build with
`NEXT_PUBLIC_BACKEND=local` — each writes to its **own** storage (the browser vs the
phone's WebView). They never see each other's data.

**The fix.** Point *both* at **one shared backend**. The code already supports this
(`src/lib/data/`); it is a configuration + hosting step, not a code change.

```
        ┌─────────────┐         ┌─────────────┐
        │ Web console │         │  Phone APK  │
        └──────┬──────┘         └──────┬──────┘
               │  read / write         │
               └───────────┬───────────┘
                           ▼
                 ONE shared backend  ← /api/state on a server (http)  OR  a cloud DB (supabase)
                 (snapshot + optimistic-lock rev; last-writer-wins is blocked)
```

Verified: two independent clients hitting one server share the same snapshot; a stale
write is rejected by the `rev` lock. The web console already runs on it (`http` mode).

---

## Option A — Self-host on the Mac mini (`http`)  ·  free, local

Good for the office / same-Wi-Fi use and for accumulating training data. **The phone
must be able to reach the Mac mini** (same Wi-Fi, or a tunnel) — so this does **not**
cover drivers out in the yard on mobile data.

**1. Run the server** (on the Mac mini):
```bash
cd itv-app
npm run build
NEXT_PUBLIC_BACKEND=http npx next start -H 0.0.0.0 -p 3000
```
Data persists to `itv-app/.ngdata/<site>.json`. Set `NG_DATA_DIR` to move it; set
`NG_STATE_TOKEN` to require a token.

**2. Find the Mac mini's LAN IP:** `ipconfig getifaddr en0` → e.g. `192.168.1.50`.

**3. Build the connected APK** (points the phone at that server):
```bash
NEXT_PUBLIC_STATE_URL="http://192.168.1.50:3000" ./scripts/build-apk.sh
```
Install the new APK. Web browsers on the LAN open `http://192.168.1.50:3000/console`.
Both now read/write the same data.

> Plain `http://` on a LAN is fine. For a public URL use `https://`.

---

## Option B — Cloud (`supabase`)  ·  field-ready, syncs from anywhere

Needed for **drivers in the field on mobile data**. Requires a **fresh, NG-Marshal-only**
Supabase project (do **not** reuse unrelated projects). Steps:

1. Create a dedicated Supabase project; run `db/migrations/001_init.sql`.
2. Web/host env: `NEXT_PUBLIC_BACKEND=supabase`, `NEXT_PUBLIC_SUPABASE_URL=…`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=…` (anon key is public-safe; the service-role key is
   server-only and never shipped to the client).
3. Build the APK with the same two `NEXT_PUBLIC_SUPABASE_*` values baked in.

Because the backend is chosen by env only, moving from Mac-mini `http` to cloud
`supabase` (or later AWS) is a config switch — no rewrite.

---

## Which to use

| | Mac mini `http` | Cloud `supabase` |
|---|---|---|
| Cost | free | free tier to start |
| Office / same-Wi-Fi | ✅ | ✅ |
| Drivers in the field (mobile data) | ❌ (LAN only) | ✅ |
| Training-data on your own box | ✅ | via export |
| Setup | run one server + build APK | new project + keys + build APK |

**Recommendation:** `http` on the Mac mini to start and validate with in-office
devices; move the live shared backend to a dedicated Supabase project when drivers in
the field need to sync. The APK must be **rebuilt and reinstalled** whenever the target
server URL changes (its value is baked in at build time).
