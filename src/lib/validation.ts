import { z } from "zod";
import { CLASS_LEVELS } from "@/lib/domain";

export const criterionInput = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อเกณฑ์"),
  maxScore: z.number().positive("คะแนนเต็มต้องมากกว่า 0"),
});

export const competitionInput = z
  .object({
    name: z.string().min(1, "กรุณากรอกชื่อรายการ").max(255),
    description: z.string().max(2000, "รายละเอียดยาวเกินไป (ไม่เกิน 2000 ตัวอักษร)").optional().default(""),
    subjectGroupId: z.number().int().positive("กรุณาเลือกหมวดวิชา"),
    type: z.enum(["individual", "team"]),
    // นักเรียนเห็นรายการนี้ในหน้าสมัครหรือไม่ (false = ครูลงให้อย่างเดียว)
    visibleToStudents: z.boolean().optional().default(true),
    teamSizeMin: z.number().int().positive().nullable().optional(),
    teamSizeMax: z.number().int().positive().nullable().optional(),
    allowedClassLevels: z.array(z.enum(CLASS_LEVELS)).min(1, "เลือกระดับชั้นอย่างน้อย 1 ระดับ"),
    // ช่วงเวลาแข่งขัน — บังคับเลือกจาก time_slots (เซิร์ฟเวอร์ resolve เป็น start/end time เอง)
    timeSlotId: z.number().int().positive("กรุณาเลือกช่วงเวลาแข่งขัน"),
    // สถานที่แข่งขัน (optional) + flag ยืนยันใช้ห้องเดียวกันเมื่อชนกับรายการอื่น
    venueId: z.number().int().positive().nullable().optional(),
    forceVenue: z.boolean().optional(),
    eventDate: z.string().nullable().optional(),
    // เดี่ยว: 'per_level' ที่นั่งต่อระดับ (capacityPerLevel) | 'combined' รวมทุกชั้น (combinedCapacity)
    // จำนวนรับ: ค่า -1 = ไม่จำกัดจำนวน (ค่า default)
    capacityMode: z.enum(["per_level", "combined"]).optional(),
    capacityPerLevel: z.record(z.string(), z.number().int().min(-1)).optional(),
    combinedCapacity: z.number().int().min(-1).optional(),
    teamCapacity: z.number().int().min(-1).optional(),
    criteria: z.array(criterionInput).min(1, "ต้องมีเกณฑ์การให้คะแนนอย่างน้อย 1 ข้อ"),
  })
  .superRefine((v, ctx) => {
    if (v.type === "team") {
      if (!v.teamSizeMin || !v.teamSizeMax)
        ctx.addIssue({ code: "custom", message: "กรุณากรอกจำนวนสมาชิกทีม (ต่ำสุด-สูงสุด)", path: ["teamSizeMin"] });
      else if (v.teamSizeMin > v.teamSizeMax)
        ctx.addIssue({ code: "custom", message: "จำนวนสมาชิกต่ำสุดต้องไม่เกินสูงสุด", path: ["teamSizeMin"] });
    }
  });

export type CompetitionInput = z.infer<typeof competitionInput>;

// ===== ช่วงเวลาแข่งขัน (time slot) =====
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const slotInput = z
  .object({
    label: z.string().min(1, "กรุณากรอกชื่อช่วงเวลา").max(191),
    startTime: z.string().regex(HHMM, "เวลาไม่ถูกต้อง"),
    endTime: z.string().regex(HHMM, "เวลาไม่ถูกต้อง"),
  })
  .refine((v) => v.startTime < v.endTime, { message: "เวลาเริ่มต้องก่อนเวลาสิ้นสุด", path: ["endTime"] });
export type SlotInput = z.infer<typeof slotInput>;

// ===== สถานที่แข่งขัน (venue master data) =====
export const venueInput = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อสถานที่").max(191),
  building: z.string().max(191).optional().default(""),
  note: z.string().max(255).optional().default(""),
});
export type VenueInput = z.infer<typeof venueInput>;

// ===== เกียรติบัตร =====

// จำกัดขนาด base64 ที่รับ (base64 พองจากไบต์จริง ~4/3 → 4MB base64 ≈ 3MB ไฟล์จริง)
// การย่อฝั่ง client ควรได้เล็กกว่านี้มาก ค่านี้เป็นเพดานกันพลาด/กันยิง API ตรง
const MAX_ASSET_B64 = 4 * 1024 * 1024;

export const certAssetInput = z.object({
  kind: z.enum(["background", "signature"]),
  name: z.string().max(191).optional().default(""),
  mime: z.enum(["image/webp", "image/png", "image/jpeg"]),
  data: z.string().min(1, "ไม่มีข้อมูลรูป").max(MAX_ASSET_B64, "ไฟล์รูปใหญ่เกินไป"),
  width: z.number().int().min(0).optional().default(0),
  height: z.number().int().min(0).optional().default(0),
});
export type CertAssetInput = z.infer<typeof certAssetInput>;

export const certEventInput = z.object({
  name: z.string().min(1, "กรุณากรอกชื่องาน").max(255),
  eventDate: z.string().nullable().optional(),
});
export type CertEventInput = z.infer<typeof certEventInput>;

const certBlock = z.object({
  id: z.string(),
  kind: z.enum([
    "student_name", "class", "team_name", "competition_name", "event_name",
    "medal", "rank", "date", "serial", "qr", "static_text",
  ]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  align: z.enum(["left", "center", "right"]),
  fontSize: z.number(),
  font: z.enum(["th-serif", "th-sans", "th-modern"]),
  weight: z.number(),
  color: z.string().max(32),
  text: z.string().max(255).optional(),
});

const certSignatureInput = z.object({
  name: z.string().max(191).optional().default(""),
  roleLabel: z.string().max(191).optional().default(""),
  mode: z.enum(["image", "blank"]),
  assetId: z.number().int().positive().nullable().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
});

// บันทึกแม่แบบทั้งก้อน (พื้นหลัง + layout + ผู้ลงนาม) ในครั้งเดียว
export const certTemplateInput = z.object({
  medalFilter: z.enum(["", "gold", "silver", "bronze"]).optional().default(""),
  backgroundAssetId: z.number().int().positive().nullable().optional(),
  orientation: z.enum(["landscape", "portrait"]).optional().default("landscape"),
  layout: z.array(certBlock),
  signatures: z.array(certSignatureInput).max(6, "ผู้ลงนามได้ไม่เกิน 6 คน"),
});
export type CertTemplateInput = z.infer<typeof certTemplateInput>;

// เลือกรายการแข่งขันเข้างาน
export const certEventCompetitionsInput = z.object({
  competitionIds: z.array(z.number().int().positive()),
});

// ครูสั่งออกเกียรติบัตร: ระบุรายการแข่งขัน (ออกให้ทุกคนที่มีผลในรายการนั้น)
export const certIssueInput = z.object({
  competitionId: z.number().int().positive(),
  entryIds: z.array(z.number().int().positive()).optional(), // ว่าง = ทุก entry ที่ได้เหรียญ
});
