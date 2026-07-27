"use client";

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// basePath (/arena) ไม่ถูกเติมให้ fetch() อัตโนมัติ ต้อง prefix เอง ไม่งั้นยิงไปผิด path แล้ว proxy คืน 404
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * เพดานรอคำตอบต่อ 1 request — ไม่ใส่ไว้ ปุ่มจะค้างอยู่สถานะ "กำลังบันทึก…" ไม่มีกำหนด
 * เมื่อเซิร์ฟเวอร์/SchoolOS ไม่ตอบ (ผู้ใช้ไม่รู้ว่าควรรอต่อหรือกดใหม่)
 * 20 วิ เผื่อ request ที่ต้องคุยกับ SchoolOS หนึ่งรอบ (ฝั่งนั้นตัดที่ 8 วิ) แล้วยังทำงาน DB ต่อ
 */
const DEFAULT_TIMEOUT_MS = 20_000;

/** ตัวเลือกต่อ request — timeoutMs: 0 = ไม่จำกัดเวลา (งานหนักอย่าง backup/restore) */
export type ApiOptions = { timeoutMs?: number };

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  opts?: ApiOptions
): Promise<ApiResult<T>> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const res = await fetch(`${BASE_PATH}${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return { ok: false, error: json?.error ?? `เกิดข้อผิดพลาด (${res.status})` };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    // แยก "รอนานเกินไป" ออกจาก "เชื่อมต่อไม่ได้" — คนละอาการ คนละวิธีแก้
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, error: "ระบบตอบสนองช้าเกินไป (หมดเวลารอ) กรุณาลองใหม่อีกครั้ง" };
    }
    return { ok: false, error: "เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }
}

export const api = {
  get: <T,>(url: string, opts?: ApiOptions) => request<T>("GET", url, undefined, opts),
  post: <T,>(url: string, body?: unknown, opts?: ApiOptions) => request<T>("POST", url, body, opts),
  put: <T,>(url: string, body?: unknown, opts?: ApiOptions) => request<T>("PUT", url, body, opts),
  patch: <T,>(url: string, body?: unknown, opts?: ApiOptions) => request<T>("PATCH", url, body, opts),
  del: <T,>(url: string, body?: unknown, opts?: ApiOptions) => request<T>("DELETE", url, body, opts),
};

/** งานที่ตั้งใจให้ใช้เวลานาน (สำรอง/กู้คืนข้อมูล, กวาดรายชื่อทั้งโรงเรียน) — ไม่ต้องตัดเวลา */
export const NO_TIMEOUT: ApiOptions = { timeoutMs: 0 };
