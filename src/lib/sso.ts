"use client";

import { api } from "@/lib/client";

/**
 * ===== SchoolOS SSO — helper กลางตัวเดียวของทั้งโปรเจกต์ =====
 *
 * ทุกการคุยกับ Users service ต้องผ่านไฟล์นี้เท่านั้น ห้ามกระจาย fetch ไปตามหน้า
 *
 * กติกาที่ยึดไว้ทั้งไฟล์
 * - `credentials: "include"` ทุก request ไม่มีข้อยกเว้น — ลืมเมื่อไหร่จะพังแบบเงียบที่สุด
 *   (endpoint ตอบ 200 เหมือนสำเร็จ แต่ไม่มีคุกกี้ติดไป → ได้ valid:false ตลอดไป)
 * - ไม่มีฟังก์ชันไหน throw — คืน discriminated union เสมอ เพื่อให้หน้าเว็บมีสถานะที่ "จบได้" ทุกทาง
 *   Users ล่ม/ยิงไม่ถึง/timeout ต้องตกไปที่ฟอร์มรหัสผ่านของเราเอง ห้ามค้างหน้าขาว
 * - usersBase มาจาก server ตอน runtime (GET /api/auth/sso/config) ไม่ใช่ NEXT_PUBLIC_* ที่ bake
 *   ตอน build — ย้ายโดเมนหรือปิด SSO จึงไม่ต้อง rebuild image
 * - ห้ามเติม BASE_PATH (/arena) ให้ URL ของ Users เด็ดขาด มันเป็นคนละแอป
 *   (ต่างจาก lib/client.ts ที่ยิง API ของเราเองแล้วต้องเติม prefix)
 * - API key ไม่มีอยู่ในไฟล์นี้และห้ามมี — การแลกโค้ดเป็นตัวตนเกิดที่ server เท่านั้น
 */

export type SsoConfig = {
  enabled: boolean;
  usersBase: string;
  audience: string;
  portalUrl: string;
  idleSeconds: number;
};

const OFF: SsoConfig = { enabled: false, usersBase: "", audience: "", portalUrl: "/", idleSeconds: 900 };

/** เพดานรอคำตอบจาก Users — หน้า login รออยู่ ต้องรู้ตัวเร็วว่าไม่ได้คำตอบ */
const TIMEOUT_MS = 6_000;

// ===== config =====
let configPromise: Promise<SsoConfig> | null = null;

/**
 * อ่านค่าตั้งต้นของ SSO จาก server (แคชไว้ตลอดอายุหน้า — ค่าไม่เปลี่ยนระหว่างใช้งาน)
 * ล้มเหลว = ถือว่า SSO ปิด แล้วใช้ฟอร์มรหัสผ่านตามปกติ ไม่ใช่เหตุให้หน้าเว็บพัง
 */
export function ssoConfig(): Promise<SsoConfig> {
  if (!configPromise) {
    configPromise = (async () => {
      const res = await api.get<SsoConfig>("/api/auth/sso/config", { timeoutMs: TIMEOUT_MS });
      if (!res.ok || !res.data?.enabled || !res.data.usersBase) return OFF;
      return { ...OFF, ...res.data };
    })();
  }
  return configPromise;
}

type Json = Record<string, unknown>;

/** fetch ที่ใส่ credentials + timeout ให้ครบ และไม่ throw — คืน null เมื่อยิงไม่ถึง/ช้าเกิน */
async function call(path: string, init?: RequestInit): Promise<{ res: Response; body: Json } | null> {
  const cfg = await ssoConfig();
  if (!cfg.enabled) return null;
  try {
    const res = await fetch(`${cfg.usersBase}${path}`, {
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
      // Users ตอบ HTML (เช่นหน้า 404 ของ Next) — ไม่ใช่ JSON ก็ไม่ต้องพัง ปล่อยเป็น {} ให้ผู้เรียกตัดสิน
    }
    return { res, body };
  } catch {
    return null; // network error / timeout
  }
}

// ===== handoff (ตัวที่ทำให้ "ไม่ต้องล็อกอินซ้ำ" ปลอดภัยจริง) =====
export type SsoHandoff =
  | { status: "ok"; code: string }
  | { status: "invalid" } // ยังไม่ได้ล็อกอินกับแพลตฟอร์ม / origin ไม่ผ่าน / ขอถี่เกิน
  | { status: "unreachable" };

/**
 * ขอโค้ดใช้ครั้งเดียว (อายุ 60 วิ) จาก session ที่ถือคุกกี้จริงในเบราว์เซอร์นี้
 * แล้วส่งต่อให้ server ของ arena เอาไปแลกตัวตนด้วย X-API-Key (ดู /api/auth/sso)
 *
 * ⚠ code คือ credential ชั่วคราว — ห้ามเก็บลง storage ห้ามใส่ใน URL ห้าม log
 * ⚠ endpoint นี้ตอบ 200 ทั้งกรณี "ยังไม่ล็อกอิน" → ต้องดูฟิลด์ valid ไม่ใช่ status code
 * ⚠ 400/403/429 ทั้งหมด = ไปหน้า login ตามปกติ ไม่ใช่ error ที่ต้องแสดงให้ผู้ใช้เห็น
 */
export async function ssoHandoffCode(): Promise<SsoHandoff> {
  const cfg = await ssoConfig();
  if (!cfg.enabled) return { status: "invalid" };
  const r = await call(`/api/auth/handoff?audience=${encodeURIComponent(cfg.audience)}`);
  if (!r) return { status: "unreachable" };
  if (!r.res.ok) return { status: "invalid" };
  const code = typeof r.body.code === "string" ? r.body.code : "";
  if (r.body.valid !== true || !code) return { status: "invalid" };
  return { status: "ok", code };
}

// ===== probe =====
export type SsoUser = { sub: string; role: "teacher" | "student"; name: string; code: string };

export type SsoProbe =
  | { status: "valid"; user: SsoUser; expiresAt: number }
  | { status: "invalid" }
  | { status: "unreachable" };

// เก็บเฉพาะผลที่ valid และเก็บได้ถึง expiresAt — ผล invalid/unreachable ไม่แคช
// เพราะเป็นสถานะที่ "พลิกกลับได้ทุกวินาที" (ผู้ใช้เพิ่งไปล็อกอินอีกแท็บ / Users เพิ่งฟื้น)
let cachedValid: { user: SsoUser; expiresAt: number } | null = null;
// กัน probe ซ้อนกันเมื่อหลายที่ถามพร้อมกัน — ทุกคนรอ Promise ใบเดียวกัน
let inflight: Promise<SsoProbe> | null = null;

/** ล้างแคช — เรียกทุกครั้งหลัง login / logout / refresh สำเร็จ */
export function clearSsoCache(): void {
  cachedValid = null;
  inflight = null;
}

/**
 * ยัง log in อยู่กับแพลตฟอร์มไหม (client-side เท่านั้น — คุกกี้อยู่ที่ origin ของ Users)
 *
 * ⚠ ไม่ต่ออายุ session ให้ (ดู ssoRefresh)
 * @param force ข้ามแคช — ใช้ตอนต้องรู้ความจริง ณ วินาทีนี้จริง ๆ เช่นเช็คว่าผู้ใช้ไป logout
 *   จากบริการอื่นมาหรือยัง ถ้าอ่านจากแคชจะมองไม่เห็นการ logout เลยจนกว่าจะถึง expiresAt
 */
export function ssoProbe(opts?: { force?: boolean }): Promise<SsoProbe> {
  if (!opts?.force && cachedValid && cachedValid.expiresAt > Date.now()) {
    return Promise.resolve({ ...cachedValid, status: "valid" as const });
  }
  if (opts?.force) cachedValid = null;
  if (inflight) return inflight;

  inflight = (async (): Promise<SsoProbe> => {
    const r = await call("/api/auth/session");
    if (!r) return { status: "unreachable" };
    const user = r.body.user as SsoUser | null | undefined;
    if (r.body.valid !== true || !user) return { status: "invalid" };
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
 * จำเป็นมาก: Users ไม่นับการใช้งาน "ในระบบ arena" เป็น activity (จงใจ) และ GET /api/auth/session
 * ก็ไม่ต่ออายุให้ → ครูที่ทำงานในระบบเรารวดเดียวจะหลุดจากแพลตฟอร์มกลางคันโดยไม่มีสัญญาณเตือน
 *
 * ⚠ ผู้เรียกต้องยิงเฉพาะตอน "ผู้ใช้ขยับจริง" เท่านั้น ถ้ายิงตามเวลาอย่างเดียวจะกลายเป็นยืด
 * session ของทั้งแพลตฟอร์มให้คนที่ลุกจากเครื่องไปแล้ว
 */
export async function ssoRefresh(): Promise<SsoRefresh> {
  const r = await call("/api/auth/refresh", { method: "POST" });
  if (!r) return { status: "unreachable" };
  if (r.res.status === 401) {
    clearSsoCache();
    return { status: "expired" };
  }
  if (!r.res.ok) return { status: "unreachable" };
  const expiresAt = Number(r.body.expiresAt) || 0;
  const absoluteEndsAt = Number(r.body.absoluteEndsAt) || 0;
  // แคชเดิมถือ deadline เก่า (refresh ไม่ได้คืน user มาให้เขียนทับ) — ล้างทิ้งให้ probe ครั้งหน้าถามใหม่
  clearSsoCache();
  return { status: "ok", expiresAt, absoluteEndsAt };
}

// ===== ออกจากระบบ =====
/**
 * พาออกจากระบบทั้งแพลตฟอร์ม แล้วไปจบที่หน้าแรกของ SchoolOS
 *
 * ⚠ ต้องเป็น navigation ครั้งเดียว ห้ามยิง POST logout ทิ้งไว้แล้วรีบเปลี่ยนหน้า
 * เบราว์เซอร์ยกเลิก request กลางคันได้ → ออกจาก SchoolOS ไม่สำเร็จแบบเงียบ ๆ
 *
 * ⚠ ล้าง session ฝั่ง arena อย่างเดียวไม่พอเด็ดขาด: คุกกี้ของ Users จะยังอยู่ พอผู้ใช้กลับเข้า
 * หน้าเรา silent SSO จะพากลับเข้าระบบเอง = ปุ่มออกเหมือนเสีย เรื่องนี้สำคัญมากกับเครื่องส่วนกลาง
 *
 * @param next path ปลายทาง — ไม่ระบุ = หน้าแรกของ SchoolOS ตามนโยบาย "session จบแล้วไปที่ portal"
 */
export async function ssoLogoutUrl(next?: string): Promise<string | null> {
  const cfg = await ssoConfig();
  if (!cfg.enabled) return null;
  // next รับเฉพาะ path ในโดเมน Users หรือ origin ที่อยู่ใน SSO_ALLOWED_ORIGINS (กัน open redirect)
  // — ใส่เป็น path ปลอดภัยที่สุด
  const target = next || cfg.portalUrl || "/";
  return `${cfg.usersBase}/api/auth/logout?next=${encodeURIComponent(target)}`;
}

/** path ของหน้าแรก SchoolOS — ใช้ตอนที่ไม่ได้จะ logout แต่แค่ส่งผู้ใช้กลับไปที่ portal */
export async function ssoPortalUrl(): Promise<string | null> {
  const cfg = await ssoConfig();
  return cfg.enabled ? cfg.portalUrl || "/" : null;
}
