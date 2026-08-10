import { db } from "@/db";
import { competitions, subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { canViewCompetition } from "@/lib/permit";
import { certIssueInput, certUndoInput } from "@/lib/validation";
import { getYearWithSettings } from "@/lib/queries";
import { computeCompetitionResults } from "@/lib/results";
import { getRoster } from "@/lib/roster";
import {
  findEventForCompetition,
  getEventTemplates,
  issueCertificates,
  lockEventIfNeeded,
  undoIssuesForCompetition,
  type IssueTarget,
} from "@/lib/certificates";
import { logAudit } from "@/lib/audit";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * รายการแข่งขัน + สิทธิ์ของผู้เรียก — ขาออกใบและขายกเลิกต้องใช้เกณฑ์เดียวกันเป๊ะ ๆ
 * (ใครออกใบของรายการไหนได้ ก็ต้องถอนคืนได้ ไม่งั้นครูออกไปแล้วถอนเองไม่ได้ ต้องวิ่งหา admin)
 */
async function findAllowedCompetition(s: SessionPayload, competitionId: number) {
  const comp = (
    await db.select().from(competitions).where(eq(competitions.id, competitionId)).limit(1)
  )[0];
  if (!comp) return { comp: null, allowed: false };

  const group = comp.subjectGroupId == null ? undefined : (
    await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1)
  )[0];
  return { comp, allowed: canViewCompetition(s, comp.createdBy, group?.catalogNo) };
}

/**
 * ครูสั่งออกเกียรติบัตรของรายการแข่งขันหนึ่ง — ออกให้สมาชิกทุกคนใน entry ที่เลือก (หรือทุก entry ถ้าไม่ระบุ)
 * ครูทุกคนเรียกได้ แต่จำกัดด้วย canViewCompetition (รายการของตัวเอง/หมวดตัวเอง; admin/recorder ได้ทุกอัน)
 * ต้องเป็นงานที่ published/locked เท่านั้น — draft แปลว่า admin ยังตั้งค่าไม่เสร็จ
 */
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const { competitionId, entryIds } = certIssueInput.parse(await req.json());

    const { comp, allowed } = await findAllowedCompetition(s, competitionId);
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    if (!allowed) return fail("ออกเกียรติบัตรได้เฉพาะรายการในหมวดของท่าน", 403);

    const event = await findEventForCompetition(competitionId);
    if (!event) return fail("รายการนี้ยังไม่ถูกจัดเข้างาน กรุณาแจ้งผู้ดูแลระบบ");
    if (event.status === "draft")
      return fail("งานนี้ยังไม่เผยแพร่ กรุณารอผู้ดูแลระบบตั้งค่าเกียรติบัตรให้เสร็จ");

    const isTraining = event.kind === "training";
    // ไม่มีคะแนน = งานอบรม (ทั้งงาน) หรือรายการที่ติ๊ก "ไม่มีการแข่งขัน" (รายการเดียว)
    const noScoring = isTraining || comp.noContest;
    // งานแข่งขันต้องประกาศผลก่อน; ที่ไม่มีคะแนนออกให้ผู้เข้าร่วมได้เลย
    if (!noScoring && !comp.isPublished)
      return fail("ต้องประกาศผลรายการนี้ก่อนจึงจะออกเกียรติบัตรได้");

    // ปีและเกณฑ์เหรียญต้องมาจาก "ปีของรายการแข่งขัน" ไม่ใช่ปีที่เปิดใช้งานอยู่
    // ไม่งั้นการออกใบย้อนหลังจะได้เลขทะเบียน/ปี พ.ศ. บนใบเป็นปีปัจจุบัน (งานปี 2567 ได้เลข 2569/xxxx)
    // และตัดเหรียญด้วยเกณฑ์ของปีผิด — ปีปัจจุบันให้ผลเหมือนเดิมทุกประการ
    const { year, setting } = await getYearWithSettings(comp.yearId);
    if (!year) return fail("ไม่พบปีการศึกษาของรายการนี้");

    const templates = await getEventTemplates(event.id);
    if (!templates.length) return fail("งานนี้ยังไม่มีแม่แบบเกียรติบัตร");

    const wantEntry = entryIds && entryIds.length ? new Set(entryIds) : null;
    const targets: IssueTarget[] = [];

    if (noScoring) {
      // ไม่มีคะแนน: ออกให้ผู้เข้าร่วมทุกคน ไม่มีอันดับ
      // อบรม = "เข้าร่วม" (none) ตามเดิม · ไม่มีการแข่งขัน = "เข้าร่วมกิจกรรม" (activity)
      const award = comp.noContest ? ("activity" as const) : ("none" as const);
      const roster = await getRoster(competitionId);
      for (const e of roster) {
        if (wantEntry && !wantEntry.has(e.entryId)) continue;
        for (const m of e.members) {
          if (m.absent) continue; // ติ๊ก "ไม่มาแข่งขัน" ไว้ — ไม่ออกใบให้
          const cls = [m.classLevel, m.classRoom].filter(Boolean).join("/");
          targets.push({
            competitionId,
            entryId: e.entryId,
            studentCode: m.studentCode,
            nameSnapshot: m.name,
            classSnapshot: cls,
            teamName: e.teamName,
            competitionName: comp.name,
            medal: award,
            rank: 0,
            percent: 0,
          });
        }
      }
    } else {
      const computed = await computeCompetitionResults(competitionId, {
        gold: setting?.medalGoldPct ?? 80,
        silver: setting?.medalSilverPct ?? 70,
        bronze: setting?.medalBronzePct ?? 60,
      });
      if (!computed) return fail("คำนวณผลไม่สำเร็จ");
      for (const r of computed.results) {
        if (wantEntry && !wantEntry.has(r.entryId)) continue;
        for (const m of r.members) {
          if (m.absent) continue; // ติ๊ก "ไม่มาแข่งขัน" ไว้ — ไม่ออกใบให้ แม้ทีมจะได้รางวัล
          const cls = [m.classLevel, m.classRoom].filter(Boolean).join("/");
          targets.push({
            competitionId,
            entryId: r.entryId,
            studentCode: m.studentCode,
            nameSnapshot: m.name,
            classSnapshot: cls,
            teamName: r.teamName,
            competitionName: comp.name,
            medal: r.medal,
            rank: r.rank,
            percent: r.percent,
          });
        }
      }
    }
    // ว่างได้สองแบบ: ไม่มีใครลงทะเบียนเลย หรือคนที่ลงไว้ถูกติ๊กว่าไม่มาแข่งขันหมด
    if (!targets.length)
      return fail("ไม่มีผู้เข้าร่วมให้ออกเกียรติบัตร (ผู้ที่ติ๊กว่า “ไม่มาแข่งขัน” จะไม่ได้รับใบ)");

    const issued = await issueCertificates({
      yearId: year.id,
      yearBe: year.yearBe,
      eventId: event.id,
      eventName: event.name,
      templates,
      targets,
      issuedBy: s.code,
    });

    await lockEventIfNeeded(event.id);
    await logAudit(s.code, "issue_certificates", {
      competitionId,
      eventId: event.id,
      count: issued.length,
      new: issued.filter((i) => !i.reused).length,
    });

    return ok({
      issueIds: issued.map((i) => i.id),
      // แยกรายคน — หน้าทะเบียนออกใบให้ทีมทั้งทีม (ต้องออกครบ) แต่พิมพ์เฉพาะใบของคนที่ขอ
      issues: issued.map((i) => ({ id: i.id, studentCode: i.studentCode, entryId: i.entryId })),
      count: issued.length,
      newCount: issued.filter((i) => !i.reused).length,
    });
  });
}

/**
 * ยกเลิกการออกเกียรติบัตรของรายการหนึ่ง — ถอนใบทั้งล็อตให้เหมือนไม่เคยกดออก
 * (คืนเลขทะเบียนที่จองไว้ + ปลดล็อกงานถ้าไม่เหลือใบเลย — รายละเอียดที่ undoIssuesForCompetition)
 *
 * สิทธิ์เท่ากับขาออกใบ ถอนได้ทีละรายการเท่านั้น เพราะเลขทะเบียนถอยคืนได้เฉพาะตอนถอนยกล็อต
 */
export async function DELETE(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const { competitionId } = certUndoInput.parse(await req.json());

    const { comp, allowed } = await findAllowedCompetition(s, competitionId);
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    if (!allowed) return fail("ยกเลิกได้เฉพาะรายการในหมวดของท่าน", 403);

    const res = await undoIssuesForCompetition(competitionId);
    if (!res.deleted) return fail("รายการนี้ยังไม่ได้ออกเกียรติบัตร");

    // เก็บเลขทะเบียนที่ถอนไว้ในบันทึกด้วย — ทะเบียนคุมมีรูโหว่เมื่อไหร่ต้องตามได้ว่าใครถอนและถอนเลขไหน
    await logAudit(s.code, "undo_certificates", {
      competitionId,
      competitionName: comp.name,
      eventId: res.eventId,
      count: res.deleted,
      serials: res.serials,
      eventUnlocked: res.eventUnlocked,
    });

    return ok({ count: res.deleted, eventUnlocked: res.eventUnlocked });
  });
}
