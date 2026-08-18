import { ok, fail, handle } from "@/lib/api";
import { getPublicResultScope, getPublicCompResult } from "@/lib/results";

export const dynamic = "force-dynamic";

/**
 * ผลของ 1 รายการสำหรับกล่อง "ดูผลรายการนี้" ที่หน้าแรก — เปิดสาธารณะเหมือนหน้า /results
 * (หน้าแรกไม่คำนวณผลไว้ล่วงหน้า เพราะเป็นหน้าที่คนเข้าเยอะและไม่มีแคช จึงดึงเฉพาะใบที่กด)
 * ขอบเขตที่ประกาศได้มาจาก getPublicResultScope ชุดเดียวกับหน้าผลรวม — รายการที่ยังไม่เผยแพร่
 * หรืออยู่นอกงานเริ่มต้น จะไม่หลุดออกทางนี้
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return fail("รหัสรายการไม่ถูกต้อง", 400);

    const { medalPct, comps } = await getPublicResultScope(id);
    const comp = comps[0];
    if (!comp) return fail("ไม่พบผลการแข่งขันของรายการนี้", 404);

    const result = await getPublicCompResult(comp, medalPct);
    if (!result) return fail("ไม่พบผลการแข่งขันของรายการนี้", 404);
    return ok(result);
  });
}
