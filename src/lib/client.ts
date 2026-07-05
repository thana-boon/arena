"use client";

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// basePath (/arena) ไม่ถูกเติมให้ fetch() อัตโนมัติ ต้อง prefix เอง ไม่งั้นยิงไปผิด path แล้ว proxy คืน 404
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function request<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE_PATH}${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return { ok: false, error: json?.error ?? `เกิดข้อผิดพลาด (${res.status})` };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: "เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }
}

export const api = {
  get: <T,>(url: string) => request<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body),
  patch: <T,>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  del: <T,>(url: string, body?: unknown) => request<T>("DELETE", url, body),
};
