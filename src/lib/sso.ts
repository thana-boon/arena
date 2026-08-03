"use client";

/**
 * ===== SchoolOS SSO — helper กลางตัวเดียวของทั้งโปรเจกต์ =====
 *
 * ทุกการคุยกับ Users service ต้องผ่านไฟล์นี้เท่านั้น ห้ามกระจาย fetch ไปตามหน้า
 *
 * กติกาที่ยึดไว้ทั้งไฟล์
 * - `credentials: "include"` ทุก request ไม่มีข้อยกเว้น — ลืมเมื่อไหร่จะพังแบบเงียบที่สุด
 *   (login ตอบ 200 เหมือนสำเร็จ แต่คุกกี้ไม่ถูก set → probe ได้ valid:false ตลอดไป)
 * - ไม่มีฟังก์ชันไหน throw — คืน discriminated union เสมอ เพื่อให้หน้าเว็บมีสถานะที่ "จบได้" ทุกทาง
 *   (Users ล่ม/ยิงไม่ถึง/timeout ต้องตกไปหน้า login ของเราเอง ห้ามค้างหน้าขาว)
 * - SSO_BASE เป็น absolute URL ข้าม origin — ห้ามเติม NEXT_PUBLIC_BASE_PATH (/arena) เด็ดขาด
 *   ต่างจาก lib/client.ts ที่ยิง API ของเราเองแล้วต้องเติม prefix
 */

/** base URL ของ Users ที่ "เบราว์เซอร์ของผู้ใช้" เรียกถึง — คนละตัวกับ SCHOOLOS_API_BASE ที่ server เราใช้ */
export const SSO_BASE = (process.env.NEXT_PUBLIC_SSO_BASE_URL ?? "").replace(/\/+$/, "");

/** ไม่ได้ตั้ง base URL = ปิด SSO ทั้งระบบ (ระบบเดิมยังทำงานได้ครบทุกอย่าง) */
export const SSO_ENABLED = SSO_BASE.length > 0;

/** ชื่อผู้บริโภคโค้ด handoff — Users ผูก audience นี้ไว้กับ API key ของ arena */
const AUDIENCE = "arena";

/** เพดานรอคำตอบ — Users ไม่ตอบต้องรู้ตัวเร็ว เพราะหน้า login ค้างรออยู่ */
const TIMEOUT_MS = 8_000;

export type SsoUser = {
  sub: string;
  role: "teacher" | "student";
  name: string;
  code: string;
  /** สิทธิ์ของ "โมดูล Users" เท่านั้น — ห้ามเอามาตัดสินสิทธิ์ในระบบ arena (ดู README ข้อ 2) */
  permissions?: string[];
};

export type SsoProbe =
  | { status: "valid"; user: SsoUser; expiresAt: number }
  | { status: "invalid" }
  | { status: "unreachable" };

type Json = Record<string, unknown>;

/** fetch ที่ใส่ credentials + timeout ให้ครบ และไม่ throw — คืน null เมื่อยิงไม่ถึง/ช้าเกิน */
async function call(
  path: string,
  init?: RequestInit
): Promise<{ res: Response; body: Json } | null> {
  if (!SSO_ENABLED) return null;
  try {
    const res = await fetch(`${SSO_BASE}${path}`, {
      ...init,
      credentials: "include", // ← หัวใจ ห้ามลบ
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let body: Json = {};
    try {
      body = text ? (JSON.parse(text) as Json) : {};
    } catch {
      // Users ตอบ HTML (เช่น 404 หน้า Next) — ไม่ใช่ JSON ก็ไม่ต้องพัง ปล่อยเป็น {} ให้ผู้เรียกตัดสิน
    }
    return { res, body };
  } catch {
    return null; // network error / timeout / CORS ถูกบล็อก
  }
}

// ===== แคช probe =====
// เก็บเฉพาะผลที่ valid และเก็บได้ถึง expiresAt (ตามข้อกำหนด) — ผล invalid/unreachable ไม่แคช
// เพราะเป็นสถานะที่ "พลิกกลับได้ทุกวินาที" (ผู้ใช้เพิ่งไปล็อกอินอีกแท็บ / Users เพิ่งฟื้น)
let cachedValid: { user: SsoUser; expiresAt: number } | null = null;
// กัน probe ซ้อนกันเมื่อหลายคอมโพเนนต์ถามพร้อมกัน — ทุกคนรอ Promise ใบเดียวกัน
let inflight: Promise<SsoProbe> | null = null;

/** ล้างแคช — ต้องเรียกทุกครั้งหลัง login / logout / refresh สำเร็จ */
export function clearSsoCache(): void {
  cachedValid = null;
  inflight = null;
}

/**
 * เช็คว่าผู้ใช้ล็อกอินกับแพลตฟอร์มอยู่ไหม (client-side เท่านั้น — คุกกี้อยู่ที่ origin ของ Users)
 *
 * ⚠ endpoint นี้ตอบ 200 ทั้งสองกรณี "ยังไม่ล็อกอิน" ไม่ใช่ error → ต้องดูฟิลด์ valid ห้ามดู status
 * ⚠ ไม่ต่ออายุ session ให้ (ดู ssoRefresh)
 *
 * @param force ข้ามแคช — ใช้ตอนต้องรู้ความจริง ณ วินาทีนี้จริง ๆ เช่นเช็คว่าผู้ใช้ไป logout
 *              จากบริการอื่นมาหรือยัง ถ้าอ่านจากแคชจะมองไม่เห็นการ logout เลยจนกว่าจะถึง expiresAt
 */
export function ssoProbe(opts?: { force?: boolean }): Promise<SsoProbe> {
  if (!SSO_ENABLED) return Promise.resolve({ status: "invalid" as const });

  if (!opts?.force && cachedValid && cachedValid.expiresAt > Date.now()) {
    return Promise.resolve({ ...cachedValid, status: "valid" as const });
  }
  if (opts?.force) cachedValid = null;
  if (inflight) return inflight;

  inflight = (async (): Promise<SsoProbe> => {
    const r = await call("/api/auth/session");
    if (!r) return { status: "unreachable" };
    const valid = r.body.valid === true;
    const user = r.body.user as SsoUser | null | undefined;
    if (!valid || !user) return { status: "invalid" };
    const expiresAt = Number(r.body.expiresAt) || Date.now();
    cachedValid = { user, expiresAt };
    return { status: "valid", user, expiresAt };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// ===== ต่ออายุ =====
export type SsoRefresh =
  | { status: "ok"; expiresAt: number; absoluteEndsAt: number }
  | { status: "expired" }
  | { status: "unreachable" };

/**
 * ต่ออายุ session ของแพลตฟอร์ม
 *
 * จำเป็นมาก: การใช้งาน "ในระบบ arena" ไม่นับเป็น activity ของ SSO และ GET /api/auth/session
 * ก็ไม่ต่ออายุให้ → ครูทำงานในระบบเรารวดเดียวจะหลุดกลางคันโดยไม่มีสัญญาณเตือนใด ๆ
 * ตัวนี้คือทางแก้เดียว ผู้เรียกต้องยิงเมื่อ "มี activity จริง + เลยครึ่งทางไป expiresAt แล้ว" เท่านั้น
 */
export async function ssoRefresh(): Promise<SsoRefresh> {
  const r = await call("/api/auth/refresh", { method: "POST" });
  if (!r) return { status: "unreachable" };
  if (r.res.status === 401) {
    clearSsoCache();
    return { status: "expired" };
  }
  if (!r.res.ok || r.body.ok !== true) return { status: "unreachable" };
  const expiresAt = Number(r.body.expiresAt) || 0;
  const absoluteEndsAt = Number(r.body.absoluteEndsAt) || 0;
  // แคชเดิมถือ deadline เก่า (และ refresh ไม่ได้คืน user มาให้เขียนทับ) — ล้างทิ้งให้ probe ครั้งหน้าไปถามใหม่
  clearSsoCache();
  return { status: "ok", expiresAt, absoluteEndsAt };
}

// ===== handoff (ตัวที่ทำให้ "ไม่ต้องล็อกอินซ้ำ" ปลอดภัยจริง) =====
export type SsoHandoff =
  | { status: "ok"; code: string }
  | { status: "invalid" } // ยังไม่ได้ล็อกอินกับแพลตฟอร์ม
  | { status: "unreachable" };

/**
 * ขอโค้ดใช้ครั้งเดียว (อายุ 60 วิ) จาก session ที่ถือคุกกี้จริงในเบราว์เซอร์นี้
 * แล้วส่งต่อให้ server ของ arena เอาไปแลกตัวตนด้วย X-API-Key (ดู /api/auth/sso)
 *
 * โค้ดนี้คือสิ่งเดียวที่ทำให้ server เรา "พิสูจน์" ตัวตนได้ — ห้ามให้ client ส่งรหัสผู้ใช้มาตรง ๆ
 * แล้วเชื่อ เพราะใครก็ตามที่รู้รหัสครูจะกลายเป็น admin ได้ทันที
 */
export async function ssoHandoffCode(): Promise<SsoHandoff> {
  const r = await call(`/api/auth/handoff?audience=${encodeURIComponent(AUDIENCE)}`);
  if (!r) return { status: "unreachable" };
  // ยังไม่ล็อกอิน: ตอบ 200 {valid:false} — 401 ก็รับไว้เผื่อ Users เปลี่ยนใจภายหลัง
  if (r.res.status === 401) return { status: "invalid" };
  if (!r.res.ok) return { status: "unreachable" };
  const code = typeof r.body.code === "string" ? r.body.code : "";
  if (r.body.valid === false || !code) return { status: "invalid" };
  return { status: "ok", code };
}

// ===== login (ทำให้ล็อกอินที่ arena แล้วบริการอื่นทั้งแพลตฟอร์มเห็นว่าล็อกอินแล้ว) =====
export type SsoLogin =
  | { status: "ok" }
  | { status: "failed"; error: string }
  | { status: "throttled"; retryAfter: number; error: string }
  | { status: "unreachable" };

async function loginAs(kind: "teacher" | "student", identifier: string, password: string): Promise<SsoLogin> {
  const path = kind === "teacher" ? "/api/auth/teacher-login" : "/api/auth/student-login";
  const body = kind === "teacher" ? { teacher_code: identifier, password } : { identifier, password };
  const r = await call(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r) return { status: "unreachable" };
  if (r.res.status === 429) {
    // Users จำกัด 30 ครั้ง/5 นาที/IP + lockout รายบัญชี — อ่าน Retry-After ไปปิดปุ่มตามจริง
    const retryAfter = Number(r.res.headers.get("Retry-After")) || 60;
    return { status: "throttled", retryAfter, error: String(r.body.error ?? "ลองเข้าสู่ระบบบ่อยเกินไป") };
  }
  if (!r.res.ok) return { status: "failed", error: String(r.body.error ?? "เข้าสู่ระบบไม่สำเร็จ") };
  clearSsoCache();
  return { status: "ok" };
}

/**
 * ล็อกอินเข้าแพลตฟอร์มด้วยรหัสผ่านเดียวกับที่กรอกในฟอร์มของเรา
 *
 * ฟอร์มของ arena มีช่องเดียว (identifier) แต่ Users แยก endpoint ครู/นักเรียน
 * จึงเดา role จากรูปแบบรหัสแบบเดียวกับ /api/auth/login (ตัวเลขล้วน = นักเรียน) แล้ว fallback อีกทาง
 */
export async function ssoLogin(identifier: string, password: string): Promise<SsoLogin> {
  const id = identifier.trim();
  const first = /^\d+$/.test(id) ? "student" : "teacher";
  const a = await loginAs(first, id, password);
  if (a.status === "ok" || a.status === "throttled" || a.status === "unreachable") return a;
  return loginAs(first === "teacher" ? "student" : "teacher", id, password);
}

// ===== logout =====

/**
 * URL สำหรับ "ออกจากระบบทั้งแพลตฟอร์ม" — ใช้เป็น navigation (location.href / <a href>)
 *
 * ⚠ ล้าง session ฝั่ง arena อย่างเดียวไม่พอเด็ดขาด: คุกกี้ sso_session จะยังอยู่
 * พอผู้ใช้กลับเข้าหน้าเรา probe ตอบ valid:true แล้วพากลับเข้าระบบเอง = ปุ่มออกเหมือนเสีย
 * เรื่องนี้สำคัญมากกับเครื่องที่ใช้ร่วมกัน (ห้องคอม / ห้องพักครู)
 *
 * @param nextPath path ในแอปเรา เช่น "/login?reason=timeout" (ฟังก์ชันเติม origin + basePath ให้เอง)
 */
export function ssoLogoutUrl(nextPath: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  // next ต้องเป็น URL เต็มที่ origin อยู่ใน SSO_ALLOWED_ORIGINS ของ Users ไม่งั้นโดนพาไปหน้า login ของ Users
  const next = `${window.location.origin}${base}${nextPath}`;
  return `${SSO_BASE}/api/auth/logout?next=${encodeURIComponent(next)}`;
}

/** ออกจากระบบแบบไม่ย้ายหน้า (best-effort) — ใช้เมื่ออยากล้าง state ฝั่งเราเองแล้วอยู่หน้าเดิม */
export async function ssoLogoutFetch(): Promise<void> {
  await call("/api/auth/logout", { method: "POST" });
  clearSsoCache();
}
