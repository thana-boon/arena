import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiAuthError } from "@/lib/auth/guards";

export function ok(data: unknown = { ok: true }, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/** ครอบ handler เพื่อจับ error เป็น message ภาษาไทย */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiAuthError) return fail(e.message, e.status);
    if (e instanceof ZodError) {
      const first = e.errors[0];
      return fail(first?.message ?? "ข้อมูลไม่ถูกต้อง", 422);
    }
    console.error("API error:", e);
    return fail("เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่", 500);
  }
}
