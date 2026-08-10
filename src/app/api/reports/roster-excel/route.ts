import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiRequireRole, ApiAuthError } from "@/lib/auth/guards";
import { fail } from "@/lib/api";
import { applyReportFilter, getReportBundles, parseReportFilter } from "@/lib/reportBundle";
import { attachmentHeader, rosterFileName, rosterWorkbook, XLSX_MIME } from "@/lib/reportExcel";

export const dynamic = "force-dynamic";

/**
 * GET: ดาวน์โหลด "ใบรายชื่อ" ของงานหนึ่งเป็นไฟล์ Excel (พารามิเตอร์ชุดเดียวกับแท็บพิมพ์)
 *
 * ขอบเขตสิทธิ์ไม่ได้เช็คที่นี่เอง แต่ยกให้ getReportBundles(session) กรองให้ตั้งแต่ต้นทาง
 * — แอดมิน/ผู้บันทึกผลได้ทุกรายการ ครูได้เฉพาะหมวดตัวเอง + รายการที่ตัวเองสร้าง
 * เท่ากับว่าครูแก้ ?event= หรือ ?groups= ในแถบที่อยู่เอง ก็ไม่ได้ข้อมูลของหมวดอื่นเพิ่ม
 */
export async function GET(req: Request) {
  try {
    const session = await apiRequireRole("teacher", "recorder", "admin");
    const sp = new URL(req.url).searchParams;
    const filter = parseReportFilter({
      event: sp.get("event") ?? undefined,
      groups: sp.get("groups") ?? undefined,
      levels: sp.get("levels") ?? undefined,
    });

    const [event] = filter.eventId
      ? await db.select().from(events).where(eq(events.id, filter.eventId))
      : [];
    const { yearBe, bundles } = await getReportBundles(session);
    const selected = applyReportFilter(bundles, filter);
    if (!event || !selected.length) return fail("ไม่พบรายการที่ต้องการส่งออก", 404);

    const fileName = rosterFileName(event.name, yearBe);
    return new NextResponse(rosterWorkbook(selected), {
      headers: {
        "content-type": XLSX_MIME,
        "content-disposition": attachmentHeader(fileName),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ApiAuthError) return fail(e.message, e.status);
    console.error("roster excel error:", e);
    return fail("สร้างไฟล์ Excel ไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
