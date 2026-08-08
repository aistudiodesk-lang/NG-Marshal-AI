# Driver app pivot — dead-simple ITV login + daily पर्ची reporting

**Date:** 2026-08-08
**Constraint (hard):** pure web only. The APK loads the live Vercel site through a
Capacitor WebView (`server.url`), so all changes must be front-end / store / DB. **No
native package, no APK rebuild.**

## Why

The old `/driver` app tried to do allocation, offers, routes, a trip state machine,
slide-to-duty and live timers. It was broken and too complex. The operator does **not**
want route/allocation tracking. They want the simplest possible thing:

1. Know **who is on which ITV, each day** (without anyone logging out).
2. Collect the **end-of-day पर्ची (parchi)** as a digital form — **for reporting only**,
   not live tracking.

## Fleet facts (from live DB)

- **Drivers (8, name dropdown):** Ramesh Yadav, Sohan Bharwad, Imran Sheikh, Kishan Desai,
  Bharat Koli, Nasim SK, Vijay Rabari, Arjun Chauhan.
- **ITVs (8, login dropdown):** A157, A670, 7118, A408, A142, A198, A225, A333.
- Phone numbers exist in the DB but are **never shown** in the app.

## The app — 3 screens (all inside `/driver`)

### 1. Login (no password, no logout)
Two dropdowns from the DB: **ITV** and **नाम (name)**. Tap **काम शुरू करो**. This:
- saves device identity (`ng-marshal-identity-v1`),
- claims the ITV for that driver, marks it **live** on the fleet board (existing
  `goOnDuty` — the ITV planner already reflects this),
- appends a **shiftLog** entry `{date, itv, driverId, driverName, at}` — the daily
  "who was assigned" trail. Handover = the next person re-picks the same ITV + their name;
  the ITV flips to them and a new shiftLog row is written. Nobody logs out.

### 2. Home (stays logged in across app close)
Greeting `नमस्ते रमेश · ITV A670`, one primary button **📋 पर्ची भरो**, and a small
**ड्राइवर / ITV बदलो** link (handover → returns to the login dropdowns).

### 3. The पर्ची form (reporting only)
- **Auto:** ITV (from login), तारीख (today).
- **Once per day (top):** Batch no, Start KM, End KM, Diesel (L), Breakdown time, Remark.
- **Two sections, identical columns** (matches the paper parchi):
  - **सामान्य (Normal)**
  - **स्कैनिंग (Scanning)**
  - Each row: **Type** `20/40` · **From** dropdown · **To** dropdown · **Mode** dropdown
    (values TBD — placeholder for now) · **Container No** (typed). **+ पंक्ति जोड़ो**.
- **जमा करो** saves a `DriverReport` to the synced Supabase blob.
- Trip count is derived = number of rows. The driver never counts anything.

Dropdown values:
- **From / To:** CT2, CT3, T2, CT4, MICT, EXIM-1, EXIM-2.
- **Type:** 20, 40.
- **Mode:** placeholder set until the operator provides the real list.

## Data model (added to the existing JSONB `state`)

```ts
interface ReportRow { type:"20"|"40"; from:string; to:string; mode?:string; container?:string }
interface DriverReport {
  id:number; date:string; itv:string; driverId:string; driverName:string;
  batch?:string; startKm?:number; endKm?:number; diesel?:number;
  breakdown?:string; remark?:string;
  normal:ReportRow[]; scanning:ReportRow[]; submittedAt:number;
}
interface ShiftLogEntry { date:string; itv:string; driverId:string; driverName:string; at:number }
```

- `state.driverReports: DriverReport[]` (+ `nextReportId`), `state.shiftLog: ShiftLogEntry[]`.
- Both added to `PERSIST_KEYS` and to `RETENTION` (capped), synced like everything else via
  the existing optimistic-lock save loop. No schema change in Supabase (single JSONB blob).

## Store actions

- `submitReport` — stamps id/driverId/driverName/submittedAt, prepends to `driverReports`.
- Login uses existing `setMe` + `claimItv` + `goOnDuty` dispatched in sequence;
  `goOnDuty` also appends the `shiftLog` row.

## Out of scope / removed

- Offers, routes, trip state machine, slide-to-duty, live earning meter, celebration,
  presence watchdog, ticket OCR flow — all removed from the driver app.
- Real FCM push (needs a rebuild) — not in this change.

## Follow-up (not this change)

- Console view of `driverReports` + `shiftLog` (a simple tab beside the existing Driver
  Log tab). Data is captured now; the console read-out is the next step.
- Real Mode dropdown values once the operator provides them.
