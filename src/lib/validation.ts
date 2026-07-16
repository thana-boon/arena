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

// ===== สถานที่แข่งขัน (venue master data) =====
export const venueInput = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อสถานที่").max(191),
  building: z.string().max(191).optional().default(""),
  note: z.string().max(255).optional().default(""),
});
export type VenueInput = z.infer<typeof venueInput>;
