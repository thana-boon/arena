import { z } from "zod";
import { CLASS_LEVELS } from "@/lib/domain";

export const criterionInput = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อเกณฑ์"),
  maxScore: z.number().positive("คะแนนเต็มต้องมากกว่า 0"),
});

export const competitionInput = z
  .object({
    name: z.string().min(1, "กรุณากรอกชื่อรายการ").max(255),
    subjectGroupId: z.number().int().positive("กรุณาเลือกหมวดวิชา"),
    type: z.enum(["individual", "team"]),
    teamSizeMin: z.number().int().positive().nullable().optional(),
    teamSizeMax: z.number().int().positive().nullable().optional(),
    allowedClassLevels: z.array(z.enum(CLASS_LEVELS)).min(1, "เลือกระดับชั้นอย่างน้อย 1 ระดับ"),
    // ช่วงเวลาแข่งขัน — บังคับเลือกจาก time_slots (เซิร์ฟเวอร์ resolve เป็น start/end time เอง)
    timeSlotId: z.number().int().positive("กรุณาเลือกช่วงเวลาแข่งขัน"),
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
