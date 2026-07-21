import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/lib/env";

/**
 * ตรวจสุขภาพระบบ — ไม่ต้อง login (คนดูแลที่เข้า shell เครื่อง prod ไม่ได้ต้องเช็คได้จากข้างนอก)
 *
 *   curl http://<host>:3017/api/health
 *
 * ห้ามคืนค่า secret ออกไปเด็ดขาด — บอกได้แค่ "ใช้ได้/ไม่ได้" กับ error code ของปลายทาง
 * เหตุผลที่ต้องมี: ตอน API key ผิด อาการที่โผล่หน้า login คือ "รหัสผ่านไม่ถูกต้อง"
 * ซึ่งชี้ไปผิดทางจนหาสาเหตุไม่เจอ — endpoint นี้ทำให้แยกออกใน 1 คำสั่ง
 */
export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail: string };

async function checkDb(): Promise<Check> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true, detail: "เชื่อมต่อได้" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "เชื่อมต่อไม่ได้" };
  }
}

async function checkSchoolOs(): Promise<Check> {
  if (!env.SCHOOLOS_API_KEY) {
    return { ok: false, detail: "ไม่ได้ตั้ง SCHOOLOS_API_KEY ใน .env" };
  }
  try {
    const res = await fetch(`${env.SCHOOLOS_API_BASE}/api/public/v1/teachers?pageSize=1`, {
      headers: { "X-API-Key": env.SCHOOLOS_API_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, detail: "API key ใช้งานได้" };

    // 401/403 ที่นี่ = key ของ arena เอง ไม่เกี่ยวกับรหัสผ่านผู้ใช้
    const code = await res
      .json()
      .then((d) => d?.error?.code as string | undefined)
      .catch(() => undefined);
    return { ok: false, detail: `API ตอบ ${res.status}${code ? ` (${code})` : ""}` };
  } catch (e) {
    return { ok: false, detail: `ต่อ API ไม่ได้: ${e instanceof Error ? e.message : "unknown"}` };
  }
}

export async function GET() {
  const [database, schoolos] = await Promise.all([checkDb(), checkSchoolOs()]);
  const ok = database.ok && schoolos.ok;

  return NextResponse.json(
    {
      ok,
      checks: {
        database,
        schoolos: {
          ...schoolos,
          base: env.SCHOOLOS_API_BASE, // base ไม่ใช่ความลับ — ช่วยดูว่าชี้ผิดเครื่องหรือเปล่า
          keyLength: env.SCHOOLOS_API_KEY.length, // ความยาวพอให้รู้ว่า "ว่าง/สั้นผิดปกติ" โดยไม่เปิดเผยค่า
        },
      },
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}
