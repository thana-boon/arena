import { z } from "zod";
import { db } from "@/db";
import { competitions, entries, entryMembers, subjectGroups } from "@/db/schema";
import { eq, and, inArray, notInArray } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { canScore } from "@/lib/permit";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  /**
   * รายชื่อ (entry_members.id) ที่ติ๊กว่า "เข้าร่วม" — ส่งมาทั้งชุดของรายการนี้เสมอ
   * คนที่ไม่อยู่ในชุดถือว่าไม่มาร่วม (absent = true) จึงไม่ได้เกียรติบัตร
   * ส่งอาเรย์ว่างได้ = ไม่มีใครมาเลย (เป็นการเช็คชื่อที่ถูกต้อง ไม่ใช่ error)
   */
  presentMemberIds: z.array(z.number().int().positive()),
});

/**
 * เช็คชื่อผู้เข้าร่วมของรายการที่ "ไม่มีการแข่งขัน" — แทนการบันทึกคะแนน
 *
 * รายการแบบนี้ไม่มีคะแนน/อันดับ/เหรียญ เหลือคำถามเดียวคือ "มาร่วมกิจกรรมจริงไหม"
 * → เขียนทับสถานะทั้งชุดในครั้งเดียว (ติ๊กเพิ่ม/เอาติ๊กออกจบในปุ่มเดียว เหมือนหน้าบันทึกคะแนน)
 * แล้วประทับเวลาไว้ที่ competitions.attendance_checked_at เพื่อบอกว่า "เช็คชื่อแล้ว"
 * (ขาออกเกียรติบัตรใช้ค่านี้กันครูลืมเช็คชื่อแล้วออกใบให้ทุกคนที่ลงทะเบียนไว้)
 *
 * สิทธิ์เท่ากับการบันทึกคะแนน: admin/recorder ทุกรายการ; ครูเฉพาะรายการในหมวดตัวเอง
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const compId = Number((await params).id);
    const comp = (await db.select().from(competitions).where(eq(competitions.id, compId)).limit(1))[0];
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    const group = comp.subjectGroupId == null ? undefined : (await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1))[0];
    if (!canScore(s, comp.createdBy, group?.catalogNo)) return fail("เช็คชื่อได้เฉพาะรายการในหมวดของท่าน", 403);
    if (!comp.noContest) return fail("รายการนี้มีการแข่งขัน — ใช้หน้าบันทึกผลเพื่อกรอกคะแนน");

    const body = schema.parse(await req.json());

    // ขอบเขตของการเขียน: สมาชิกทุกคนใน entry ที่ยัง active ของรายการนี้เท่านั้น
    const validEntries = (
      await db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.competitionId, compId), eq(entries.status, "active")))
    ).map((e) => e.id);
    const memberRows = validEntries.length
      ? await db
          .select({ id: entryMembers.id, name: entryMembers.nameSnapshot, code: entryMembers.studentCode })
          .from(entryMembers)
          .where(inArray(entryMembers.entryId, validEntries))
      : [];
    if (!memberRows.length) return fail("ยังไม่มีผู้ลงทะเบียนในรายการนี้");

    const memberIds = memberRows.map((m) => m.id);
    const presentIds = [...new Set(body.presentMemberIds)];
    if (presentIds.some((id) => !memberIds.includes(id))) return fail("พบผู้เข้าร่วมที่ไม่ถูกต้อง");

    await db.transaction(async (tx) => {
      if (presentIds.length)
        await tx.update(entryMembers).set({ absent: false }).where(inArray(entryMembers.id, presentIds));
      // ที่เหลือ = ไม่ได้ติ๊ก = ไม่มาร่วม (เขียนทับทุกครั้ง ไม่ใช่เพิ่มสะสม)
      await tx
        .update(entryMembers)
        .set({ absent: true })
        .where(
          presentIds.length
            ? and(inArray(entryMembers.id, memberIds), notInArray(entryMembers.id, presentIds))
            : inArray(entryMembers.id, memberIds)
        );
      await tx
        .update(competitions)
        .set({ attendanceCheckedAt: new Date(), attendanceCheckedBy: s.code })
        .where(eq(competitions.id, compId));
    });

    await logAudit(s.code, "record_attendance", {
      competitionId: compId,
      competitionName: comp.name,
      present: presentIds.length,
      total: memberIds.length,
      // ใครไม่ได้มา = ใครไม่ได้ใบ ต้องตามรอยได้ว่าใครเป็นคนเช็ค (เก็บชื่อคู่รหัสเหมือน log อื่น)
      ...(presentIds.length < memberIds.length
        ? {
            notPresent: memberRows
              .filter((m) => !presentIds.includes(m.id))
              .map((m) => `${m.name} (${m.code})`),
          }
        : {}),
    });

    return ok({ present: presentIds.length, total: memberIds.length });
  });
}
