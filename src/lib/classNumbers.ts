import "server-only";
import { listStudentsInRoom, listAllStudents } from "@/lib/external/student-api";

/**
 * ===== เลขที่ในห้องบนเอกสาร: อ่าน snapshot ก่อน ขาดค่อยถาม SchoolOS =====
 *
 * แหล่งความจริงคือ snapshot ที่ freeze ไว้ตอนสมัคร (entry_members.class_number_snapshot)
 * เหมือน ชื่อ/ชั้น/ห้อง — เพราะ enrollments ของ SchoolOS แยกตามปีการศึกษา พอขึ้นปีใหม่
 * เด็กที่จบ/ลาออกไปแล้วจะไม่มีแถวของปีใหม่ ถามกลับไปก็ไม่เหลืออะไรให้ตอบ
 *
 * การยิง API ที่นี่เป็นแค่ "ตาข่ายรับ" ของคนที่สมัครไว้ก่อนระบบจะเก็บเลขที่ (snapshot = "")
 * ไม่ใช่ทางหลัก — พอรัน backfill แล้วโค้ดส่วนนี้จะแทบไม่ถูกเรียกอีกเลย
 */

/** studentCode → เลขที่ */
export type ClassNumberMap = Map<string, string>;

/**
 * เกินกี่ห้องแล้วถึงเปลี่ยนไปกวาดทั้งโรงเรียนแทนการยิงรายห้อง
 *
 * ยิงรายห้องเร็วกว่าในเวลาจริงแม้จะหลาย request เพราะยิงขนานกันหมด (allSettled ข้างล่าง)
 * ขณะที่กวาดทั้งโรงเรียนต้องไล่ทีละหน้าตามลำดับ (~10 รอบ) — เพดานนี้มีไว้กันยิงถล่ม
 * SchoolOS ทีเดียวหลายสิบ request ไม่ใช่เพราะรายห้องช้า
 */
const SWEEP_THRESHOLD = 20;

type MemberLike = { studentCode: string; classLevel: string; classRoom: string; classNumber: string };

/**
 * รวมเลขที่ของสมาชิกทุกคนบนเอกสารใบหนึ่ง
 *
 * คนที่มี snapshot อยู่แล้วใช้ค่านั้นเลย ไม่ยิง API — ที่ยิงคือเฉพาะคนที่ยังว่าง
 * ถ้าไม่มีใครว่างเลย (กรณีปกติหลัง backfill) ฟังก์ชันนี้ไม่แตะเครือข่ายเลยสักครั้ง
 *
 * ห้ามโยน error ออกไป: SchoolOS ล่มหรือช้าไม่ควรทำให้พิมพ์เอกสารไม่ได้
 * ช่องที่หาไม่เจอจะขึ้น "-" ซึ่งยังดีกว่าไม่ได้กระดาษ
 */
export async function resolveClassNumbers(members: MemberLike[]): Promise<ClassNumberMap> {
  const map: ClassNumberMap = new Map();
  for (const m of members) {
    if (m.classNumber) map.set(m.studentCode, m.classNumber);
  }

  const missing = members.filter((m) => !m.classNumber && !map.has(m.studentCode));
  if (!missing.length) return map;

  // เก็บเป็นคู่ (ชั้น, ห้อง) ตรง ๆ ไม่ต้องแปลงกลับจากคีย์ข้อความ — ชื่อห้องมีช่องว่างได้
  const rooms = new Map<string, { classLevel: string; classRoom: string }>();
  for (const m of missing) {
    if (m.classLevel && m.classRoom) {
      rooms.set(`${m.classLevel}|${m.classRoom}`, { classLevel: m.classLevel, classRoom: m.classRoom });
    }
  }
  if (!rooms.size) return map;

  // status "all" ไม่ใช่ default — คนที่จบ/ลาออกไปแล้วก็เคยลงแข่งและต้องมีเลขที่บนกระดาษ
  const batches =
    rooms.size <= SWEEP_THRESHOLD
      ? [...rooms.values()].map((r) => listStudentsInRoom(r.classLevel, r.classRoom, "all"))
      : [listAllStudents("all")];

  // allSettled ไม่ใช่ all — ห้องเดียวพังไม่ควรทำให้เลขที่ของห้องที่เหลือหายไปด้วย
  for (const result of await Promise.allSettled(batches)) {
    if (result.status !== "fulfilled") continue;
    for (const s of result.value) {
      if (s.class_number && !map.has(s.student_code)) map.set(s.student_code, s.class_number);
    }
  }
  return map;
}

/** ทับเลขที่ที่หามาได้ลงในรายชื่อ — ไม่รู้ = "" แล้วให้ชั้นเอกสารตัดสินใจว่าจะแสดงอะไร */
export function withClassNumbers<T extends { studentCode: string }>(
  members: T[],
  classNumbers: ClassNumberMap
): (T & { classNumber: string })[] {
  return members.map((m) => ({ ...m, classNumber: classNumbers.get(m.studentCode) ?? "" }));
}
