import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { searchRegistry } from "@/lib/certRegistry";

/**
 * ค้นทะเบียนเกียรติบัตรย้อนหลัง (ทุกปีการศึกษา) ด้วยรหัสนักเรียน/ชื่อ
 *
 * ครูทุกคนค้นได้ ไม่จำกัดตามหมวด — ข้อมูลที่คืนคือสิ่งที่พิมพ์อยู่บนใบซึ่งเปิดสาธารณะ
 * ผ่าน QR (/verify) อยู่แล้ว และเคาน์เตอร์ที่รับคำขอจากศิษย์เก่าไม่จำเป็นต้องเป็นครูหมวดนั้น
 * ส่วนการ "ออกใบใหม่" ยังบังคับ canViewCompetition ที่ /api/certificates/issue ตามเดิม
 */
export async function GET(req: Request) {
  return handle(async () => {
    await apiRequireRole("teacher", "recorder", "admin");
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) return fail("กรุณากรอกรหัสนักเรียนหรือชื่ออย่างน้อย 2 ตัวอักษร");
    const rows = await searchRegistry(q);
    return ok({ rows });
  });
}
