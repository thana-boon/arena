import "server-only";
import { cookies } from "next/headers";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { isStaff, type Role } from "@/lib/auth/session";
import {
  DISMISS_COOKIE,
  parseDismissed,
  type AnnouncementView,
} from "@/lib/announcementTypes";

/** กุญแจของประกาศ 1 อัน — วินาที (ไม่ใช่มิลลิวินาที) ให้ cookie สั้นที่สุดเท่าที่ยังแยกเวอร์ชันได้ */
const keyOf = (id: number, updatedAt: Date) => `${id}-${Math.floor(updatedAt.getTime() / 1000)}`;

/**
 * ประกาศที่ต้องแสดงให้คนที่ล็อกอินอยู่เห็น "ตอนนี้"
 * - เปิดอยู่ (is_active) และตรงกับบทบาท: ครู/ผู้บันทึกผล/แอดมิน = กลุ่ม 'teacher' กลุ่มเดียวกัน
 * - ตัดอันที่เคยกดปิดไปแล้วออกตั้งแต่ฝั่งเซิร์ฟเวอร์ (อ่านจาก cookie) — หน้าจึงไม่กระตุกตอนโหลด
 * เรียงใหม่สุดขึ้นก่อน เพราะประกาศล่าสุดมักเป็นเรื่องที่ต้องรู้ก่อน
 */
export async function getAnnouncementsFor(role: Role): Promise<AnnouncementView[]> {
  const audiences = ["all", isStaff(role) ? "teacher" : "student"];
  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      level: announcements.level,
      dismissible: announcements.dismissible,
      updatedAt: announcements.updatedAt,
    })
    .from(announcements)
    .where(and(eq(announcements.isActive, true), inArray(announcements.audience, audiences)))
    .orderBy(desc(announcements.updatedAt));
  if (!rows.length) return [];

  const jar = await cookies();
  const dismissed = new Set(parseDismissed(jar.get(DISMISS_COOKIE)?.value));

  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      level: r.level,
      dismissible: r.dismissible,
      key: keyOf(r.id, r.updatedAt),
    }))
    // ประกาศที่ตั้งว่า "ปิดไม่ได้" แสดงเสมอ ต่อให้ cookie มีกุญแจค้างอยู่จากตอนที่ยังปิดได้
    .filter((a) => !a.dismissible || !dismissed.has(a.key));
}
