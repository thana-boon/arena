import "server-only";
import { db } from "@/db";
import { certificateIssues, events } from "@/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { listCompetitions, type CompListItem } from "@/lib/listings";
import { canViewCompetition } from "@/lib/permit";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * หน้าออกเกียรติบัตรของครู/แอดมิน — เดินเป็นสองชั้น: เลือก "งาน" ก่อน แล้วค่อยเห็นรายการในงานนั้น
 *
 * ทำไมต้องแยกไฟล์: ทั้งฝั่งครู (/teacher/certificates) และฝั่งแอดมิน (/admin/cert-issue)
 * ใช้ข้อมูลชุดเดียวกันเป๊ะ ๆ ต่างกันแค่ layout ที่ครอบอยู่ — ถ้าปล่อยให้แต่ละหน้าคิวรีเอง
 * วันหนึ่งเงื่อนไข "ออกได้/ออกไม่ได้" จะเพี้ยนกันคนละมุมโดยไม่มีอะไรฟ้อง
 */

export type CertIssueEventCard = {
  id: number;
  name: string;
  kind: string;
  status: string;
  eventDate: string | null;
  /** จำนวนรายการในงานนี้ที่ผู้ใช้คนนี้มีสิทธิ์เห็น */
  compCount: number;
  /** ในนั้น ออกเกียรติบัตรได้แล้วกี่รายการ */
  readyCount: number;
  /** ใบที่ออกไปแล้วของรายการเหล่านั้น */
  issuedCount: number;
};

export type CertIssueCompRow = {
  id: number;
  name: string;
  groupName: string;
  activeEntries: number;
  issuedCount: number;
  ready: boolean;
  reason: string;
};

export type CertIssueEventDetail = {
  event: { id: number; name: string; kind: string; status: string; eventDate: string | null };
  rows: CertIssueCompRow[];
};

/**
 * ออกเกียรติบัตรของรายการนี้ได้หรือยัง — เงื่อนไขเดียวกับที่ /api/certificates/issue บังคับจริง
 * (งานอบรมทั้งงาน หรือรายการที่ตั้งเป็น "ไม่มีการแข่งขัน" ไม่ต้องรอประกาศผล)
 */
function issueStatus(
  ev: { kind: string; status: string },
  comp: { noContest: boolean; isPublished: boolean }
): { ready: boolean; reason: string } {
  const noScoring = ev.kind === "training" || comp.noContest;
  if (ev.status === "draft") return { ready: false, reason: "ผู้ดูแลยังตั้งค่าไม่เสร็จ" };
  if (!noScoring && !comp.isPublished) return { ready: false, reason: "ยังไม่ประกาศผล" };
  return { ready: true, reason: "" };
}

/** จำนวนใบที่ออกแล้วต่อรายการแข่งขัน */
async function issuedCountByComp(compIds: number[]): Promise<Map<number, number>> {
  if (!compIds.length) return new Map();
  const rows = await db
    .select({ competitionId: certificateIssues.competitionId, n: sql<number>`count(*)::int` })
    .from(certificateIssues)
    .where(inArray(certificateIssues.competitionId, compIds))
    .groupBy(certificateIssues.competitionId);
  return new Map(rows.map((r) => [r.competitionId, r.n]));
}

/** รายการแข่งขันในปีนี้ที่ผู้ใช้คนนี้มีสิทธิ์เห็น */
async function viewableCompetitions(
  session: SessionPayload,
  yearId: number
): Promise<CompListItem[]> {
  const all = await listCompetitions(yearId);
  return all.filter((c) => canViewCompetition(session, c.createdBy, c.groupCatalogNo));
}

/**
 * งานทั้งหมดที่มีรายการของผู้ใช้คนนี้อยู่ (งานที่ไม่มีรายการให้เขาเลยไม่ต้องโชว์)
 * orphanCount = รายการที่ยังไม่ถูกจัดเข้างาน — ออกใบไม่ได้ และไม่มีงานให้กดเข้าไปดู
 * จึงต้องบอกจำนวนไว้บนหน้าแรก ไม่งั้นครูจะหารายการของตัวเองไม่เจอแล้วไม่รู้ว่าทำไม
 */
export async function listCertIssueEvents(
  session: SessionPayload,
  yearId: number
): Promise<{ events: CertIssueEventCard[]; orphanCount: number }> {
  const comps = await viewableCompetitions(session, yearId);
  const orphanCount = comps.filter((c) => c.eventId == null).length;

  const evs = await db.select().from(events).where(eq(events.yearId, yearId)).orderBy(asc(events.name));
  if (!evs.length) return { events: [], orphanCount };

  const issued = await issuedCountByComp(comps.map((c) => c.id));

  const cards: CertIssueEventCard[] = [];
  for (const ev of evs) {
    const inEvent = comps.filter((c) => c.eventId === ev.id);
    if (!inEvent.length) continue;
    cards.push({
      id: ev.id,
      name: ev.name,
      kind: ev.kind,
      status: ev.status,
      eventDate: ev.eventDate,
      compCount: inEvent.length,
      readyCount: inEvent.filter((c) => issueStatus(ev, c).ready).length,
      issuedCount: inEvent.reduce((s, c) => s + (issued.get(c.id) ?? 0), 0),
    });
  }
  return { events: cards, orphanCount };
}

/** รายการในงานหนึ่ง พร้อมสถานะว่าออกเกียรติบัตรได้หรือยัง — null = ไม่มีงานนี้ในปีที่เปิดอยู่ */
export async function getCertIssueEvent(
  session: SessionPayload,
  yearId: number,
  eventId: number
): Promise<CertIssueEventDetail | null> {
  const ev = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
  if (!ev || ev.yearId !== yearId) return null;

  const comps = (await viewableCompetitions(session, yearId)).filter((c) => c.eventId === eventId);
  const issued = await issuedCountByComp(comps.map((c) => c.id));

  const rows = comps
    .map((c) => ({
      id: c.id,
      name: c.name,
      groupName: c.groupName,
      activeEntries: c.activeEntries,
      issuedCount: issued.get(c.id) ?? 0,
      ...issueStatus(ev, c),
    }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName, "th") || a.name.localeCompare(b.name, "th"));

  return {
    event: { id: ev.id, name: ev.name, kind: ev.kind, status: ev.status, eventDate: ev.eventDate },
    rows,
  };
}
