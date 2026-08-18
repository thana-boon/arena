import "server-only";
import { db } from "@/db";
import { certificateIssues, events } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { listCompetitions, type CompListItem } from "@/lib/listings";
import { certIssueGate } from "@/lib/domain";
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
  /** id ของใบที่ออกไปแล้ว (เรียงตามลำดับที่ออก) — ปุ่ม PDF ใช้ยิงไปหน้าพิมพ์ได้เลยโดยไม่ต้องออกใบซ้ำ */
  issueIds: number[];
  ready: boolean;
  reason: string;
};

export type CertIssueEventDetail = {
  event: { id: number; name: string; kind: string; status: string; eventDate: string | null };
  rows: CertIssueCompRow[];
};

/**
 * id ของใบที่ออกแล้ว แยกตามรายการแข่งขัน (เรียงตาม id = ลำดับที่ออกจริง ซึ่งคือลำดับอันดับ)
 * เอา id มาด้วยไม่ใช่แค่จำนวน เพราะปุ่ม "PDF" ต้องเปิดหน้าพิมพ์ของใบที่ออกไปแล้วได้
 * โดยไม่ต้องเรียก /api/certificates/issue ซ้ำ (ซึ่งจะไปเพิ่ม reprint_count ทุกครั้งที่แค่อยากดู)
 */
async function issuedIdsByComp(compIds: number[]): Promise<Map<number, number[]>> {
  if (!compIds.length) return new Map();
  const rows = await db
    .select({ id: certificateIssues.id, competitionId: certificateIssues.competitionId })
    .from(certificateIssues)
    .where(inArray(certificateIssues.competitionId, compIds))
    .orderBy(asc(certificateIssues.id));
  const map = new Map<number, number[]>();
  for (const r of rows) {
    const list = map.get(r.competitionId);
    if (list) list.push(r.id);
    else map.set(r.competitionId, [r.id]);
  }
  return map;
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

  const issued = await issuedIdsByComp(comps.map((c) => c.id));

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
      readyCount: inEvent.filter((c) => certIssueGate(ev, c).ready).length,
      issuedCount: inEvent.reduce((s, c) => s + (issued.get(c.id)?.length ?? 0), 0),
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
  const issued = await issuedIdsByComp(comps.map((c) => c.id));

  const rows = comps
    .map((c) => {
      const gate = certIssueGate(ev, c);
      const issueIds = issued.get(c.id) ?? [];
      return {
        id: c.id,
        name: c.name,
        groupName: c.groupName,
        activeEntries: c.activeEntries,
        issuedCount: issueIds.length,
        issueIds,
        ready: gate.ready,
        reason: gate.reason,
      };
    })
    .sort((a, b) => a.groupName.localeCompare(b.groupName, "th") || a.name.localeCompare(b.name, "th"));

  return {
    event: { id: ev.id, name: ev.name, kind: ev.kind, status: ev.status, eventDate: ev.eventDate },
    rows,
  };
}
