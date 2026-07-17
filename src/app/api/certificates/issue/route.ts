import { db } from "@/db";
import { competitions, subjectGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { canViewCompetition } from "@/lib/permit";
import { certIssueInput } from "@/lib/validation";
import { getActiveYearWithSettings } from "@/lib/queries";
import { computeCompetitionResults } from "@/lib/results";
import { getRoster } from "@/lib/roster";
import {
  findEventForCompetition,
  getEventTemplates,
  issueCertificates,
  lockEventIfNeeded,
  type IssueTarget,
} from "@/lib/certificates";
import { logAudit } from "@/lib/audit";

/**
 * ครูสั่งออกเกียรติบัตรของรายการแข่งขันหนึ่ง — ออกให้สมาชิกทุกคนใน entry ที่เลือก (หรือทุก entry ถ้าไม่ระบุ)
 * ครูทุกคนเรียกได้ แต่จำกัดด้วย canViewCompetition (รายการของตัวเอง/หมวดตัวเอง; admin/recorder ได้ทุกอัน)
 * ต้องเป็นงานที่ published/locked เท่านั้น — draft แปลว่า admin ยังตั้งค่าไม่เสร็จ
 */
export async function POST(req: Request) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const { competitionId, entryIds } = certIssueInput.parse(await req.json());

    const comp = (
      await db.select().from(competitions).where(eq(competitions.id, competitionId)).limit(1)
    )[0];
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);

    const group = comp.subjectGroupId == null ? undefined : (
      await db.select().from(subjectGroups).where(eq(subjectGroups.id, comp.subjectGroupId)).limit(1)
    )[0];
    if (!canViewCompetition(s, comp.createdBy, group?.catalogNo))
      return fail("ออกเกียรติบัตรได้เฉพาะรายการในหมวดของท่าน", 403);

    const event = await findEventForCompetition(competitionId);
    if (!event) return fail("รายการนี้ยังไม่ถูกจัดเข้างาน กรุณาแจ้งผู้ดูแลระบบ");
    if (event.status === "draft")
      return fail("งานนี้ยังไม่เผยแพร่ กรุณารอผู้ดูแลระบบตั้งค่าเกียรติบัตรให้เสร็จ");

    const isTraining = event.kind === "training";
    // งานแข่งขันต้องประกาศผลก่อน; งานอบรมออกให้ผู้เข้าร่วมได้เลย (ไม่มีการให้คะแนน)
    if (!isTraining && !comp.isPublished)
      return fail("ต้องประกาศผลรายการนี้ก่อนจึงจะออกเกียรติบัตรได้");

    const { year, setting } = await getActiveYearWithSettings();
    if (!year) return fail("ไม่พบปีการศึกษาที่เปิดใช้งาน");

    const templates = await getEventTemplates(event.id);
    if (!templates.length) return fail("งานนี้ยังไม่มีแม่แบบเกียรติบัตร");

    const wantEntry = entryIds && entryIds.length ? new Set(entryIds) : null;
    const targets: IssueTarget[] = [];

    if (isTraining) {
      // อบรม: ออกให้ผู้เข้าร่วมทุกคน (medal none, ไม่มีอันดับ)
      const roster = await getRoster(competitionId);
      for (const e of roster) {
        if (wantEntry && !wantEntry.has(e.entryId)) continue;
        for (const m of e.members) {
          const cls = [m.classLevel, m.classRoom].filter(Boolean).join("/");
          targets.push({
            competitionId,
            entryId: e.entryId,
            studentCode: m.studentCode,
            nameSnapshot: m.name,
            classSnapshot: cls,
            teamName: e.teamName,
            competitionName: comp.name,
            medal: "none",
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
    if (!targets.length) return fail("ไม่มีผู้เข้าร่วมให้ออกเกียรติบัตร");

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
      count: issued.length,
      newCount: issued.filter((i) => !i.reused).length,
    });
  });
}
