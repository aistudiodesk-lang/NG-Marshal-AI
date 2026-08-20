// Device identity — set ONCE at onboarding, then every launch opens the person's
// own view with zero clicks. Role comes from the masters (master control), never
// from a picker. Stored in its OWN localStorage key: identity is per-device and
// must never ride along in the synced site snapshot.

export type MobileRole = "driver" | "operator" | "supervisor";

export interface DeviceIdentity {
  personId: string;
  role: MobileRole;
  name: string;
  nameLocal?: string; // Hindi name where available
  setAt: string; // ISO date
}

const KEY = "ng-marshal-identity-v1";
const COOKIE = "ngm_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

// Belt-and-suspenders persistence: keep the logged-in driver in BOTH localStorage and a
// 1-year cookie. Some Android WebViews wipe localStorage when the app process is killed;
// the cookie survives that (and vice-versa), so the driver never has to pick their name
// again — reopening the app lands straight on the capture screen. Only "बदलो" clears it.
function writeCookie(raw: string): void {
  try { document.cookie = `${COOKIE}=${encodeURIComponent(raw)}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`; } catch {}
}
function readCookie(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

export function getIdentity(): DeviceIdentity | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch {}
  if (!raw) raw = readCookie(); // fall back to the cookie if localStorage was cleared
  if (!raw) return null;
  try {
    const id = JSON.parse(raw) as DeviceIdentity;
    if (!(id.personId && id.role)) return null;
    // re-sync both stores so whichever was empty is restored
    try { localStorage.setItem(KEY, raw); } catch {}
    writeCookie(raw);
    return id;
  } catch {
    return null;
  }
}

export function setIdentity(id: DeviceIdentity): void {
  const raw = JSON.stringify(id);
  try { localStorage.setItem(KEY, raw); } catch {}
  writeCookie(raw);
}

export function clearIdentity(): void {
  try { localStorage.removeItem(KEY); } catch {}
  try { document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`; } catch {}
}

export function roleHome(role: MobileRole): string {
  return role === "driver" ? "/driver" : role === "operator" ? "/operator" : "/supervisor";
}

/** Normalise a phone number for matching: last 10 digits. */
export function normPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  return digits.slice(-10);
}
