import "server-only";
import { db } from "@/db";
import { criteria, entries, scores } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { listCompetitions } from "@/lib/listings";
import { canScore } from "@/lib/permit";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * ความคืบหน้าการกรอกคะแนนของรายการหนึ่ง — ใช้เตือนก่อนประกาศ
 *  - empty    = ยังไม่ได้กรอกคะแนนเลย
 *  - partial  = กรอกไปบ้างแล้วแต่ยังไม่ครบทุกคน/ทุกเกณฑ์
 *  - complete = ครบทุกคน × ทุกเกณฑ์
 */
export type ScoringState = "empty" | "partial" | "complete";

/** 1 แถวในหน้าประกาศผล */
export type PublishRow = {
  id: number;
  name: string;
  subjectGroupId: number | null;
  groupCatalogNo: number | null;
  groupName: string;
  eventId: number | null;
  eventName: string;
  eventDate: string | null;
  isPublished: boolean;
  entries: number; // ผู้เข้าแข่งขันที่ยังไม่ถอนตัว
  scoredEntries: number; // ในจำนวนนั้น มีคะแนนแล้วอย่างน้อย 1 เกณฑ์กี่ราย
  state: ScoringState;
};

/**
 * รายการที่ผู้ใช้คนนี้ "ประกาศผลได้" ในปีการศึกษาหนึ่ง พร้อมความคืบหน้าการกรอกคะแนน
 *
 * ขอบเขตการมองเห็นใช้ canScore ตัวเดียวกับ API ประกาศผล (ครูเห็นเฉพาะหมวดตัวเอง +
 * รายการที่ตัวเองสร้าง, admin/recorder เห็นทุกรายการ) — ไม่งั้นหน้าจะโชว์ปุ่มที่กดแล้วโดน 403
 *
 * รายการที่ตั้งไว้ว่า "ไม่มีการแข่งขัน" ตัดออกทั้งหมด: ไม่มีคะแนน ไม่มีอันดับ จึงไม่มีผลให้ประกาศ
 * และต้องไม่ถูกนับเป็นตัวหารของ % ความคืบหน้าด้วย (ไม่งั้น % ไม่มีวันเต็ม 100)
 */
export async function listPublishBoard(session: SessionPayload, yearId: number): Promise<PublishRow[]> {
  const all = await listCompetitions(yearId);
  const comps = all.filter((c) => !c.noContest && canScore(session, c.createdBy, c.groupCatalogNo));
  if (!comps.length) return [];

  const ids = comps.map((c) => c.id);
  // นับทีเดียวทั้งปี: กี่รายที่มีคะแนน (distinct) และกรอกไปแล้วกี่ช่อง (ใช้เทียบว่าครบไหม)
  const scored = await db
    .select({
      competitionId: entries.competitionId,
      scoredEntries: sql<number>`count(distinct ${scores.entryId})::int`,
      cells: sql<number>`count(*)::int`,
    })
    .from(scores)
    .innerJoin(entries, eq(entries.id, scores.entryId))
    .where(and(inArray(entries.competitionId, ids), eq(entries.status, "active")))
    .groupBy(entries.competitionId);
  const critCounts = await db
    .select({ competitionId: criteria.competitionId, n: sql<number>`count(*)::int` })
    .from(criteria)
    .where(inArray(criteria.competitionId, ids))
    .groupBy(criteria.competitionId);

  const scoreByComp = new Map(scored.map((r) => [r.competitionId, r]));
  const critByComp = new Map(critCounts.map((r) => [r.competitionId, r.n]));

  return comps
    .map((c) => {
      const s = scoreByComp.get(c.id);
      const scoredEntries = s?.scoredEntries ?? 0;
      const crits = critByComp.get(c.id) ?? 0;
      // ยังไม่มีผู้เข้าแข่งขันหรือยังไม่มีเกณฑ์ = ยังกรอกให้ครบไม่ได้ ถือเป็น empty ไม่ใช่ complete
      const state: ScoringState =
        c.activeEntries > 0 && crits > 0 && (s?.cells ?? 0) >= c.activeEntries * crits
          ? "complete"
          : scoredEntries > 0
            ? "partial"
            : "empty";
      return {
        id: c.id,
        name: c.name,
        subjectGroupId: c.subjectGroupId,
        groupCatalogNo: c.groupCatalogNo,
        groupName: c.groupName,
        eventId: c.eventId,
        eventName: c.eventName,
        eventDate: c.eventDate,
        isPublished: c.isPublished,
        entries: c.activeEntries,
        scoredEntries,
        state,
      };
    })
    .sort(
      (a, b) =>
        (a.groupCatalogNo ?? 9999) - (b.groupCatalogNo ?? 9999) ||
        a.groupName.localeCompare(b.groupName, "th") ||
        a.name.localeCompare(b.name, "th")
    );
}
