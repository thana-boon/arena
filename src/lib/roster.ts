import "server-only";
import { db } from "@/db";
import { entries, entryMembers, competitionCapacity } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type RosterMember = {
  /** entry_members.id — หน้าบันทึกผลใช้อ้างถึงคนคนนี้ตอนติ๊ก "ไม่มาแข่งขัน" (รหัสนักเรียนซ้ำข้าม entry ได้) */
  memberId: number;
  studentCode: string;
  name: string;
  classLevel: string;
  classRoom: string;
  classNumber: string;
  /** ลงทะเบียนไว้แต่ไม่มาแข่ง — ยังอยู่ในรายชื่อ แต่ไม่ออกเกียรติบัตรให้ */
  absent: boolean;
  /**
   * คนนี้เข้ามาแทนคนเดิม (เปลี่ยนตัว) — ใช้ติดป้าย "(เปลี่ยนตัว)" ที่หน้าบันทึกผลเท่านั้น
   * ห้ามเอาไปต่อท้ายชื่อในเอกสาร/เกียรติบัตร (ดูหมายเหตุที่ entry_members.substituted)
   */
  substituted: boolean;
};

export type RosterEntry = {
  entryId: number;
  teamName: string | null;
  members: RosterMember[];
};

export async function getRoster(competitionId: number): Promise<RosterEntry[]> {
  const entRows = await db
    .select()
    .from(entries)
    .where(and(eq(entries.competitionId, competitionId), eq(entries.status, "active")));
  if (!entRows.length) return [];
  const members = await db.select().from(entryMembers);
  return entRows.map((e) => ({
    entryId: e.id,
    teamName: e.teamName,
    members: members
      .filter((m) => m.entryId === e.id)
      .map((m) => ({
        memberId: m.id,
        studentCode: m.studentCode,
        name: m.nameSnapshot,
        classLevel: m.classLevelSnapshot,
        classRoom: m.classRoomSnapshot,
        classNumber: m.classNumberSnapshot,
        absent: m.absent,
        substituted: m.substituted,
      })),
  }));
}

export async function getCapacityRows(competitionId: number) {
  return db.select().from(competitionCapacity).where(eq(competitionCapacity.competitionId, competitionId));
}
