import { db } from "@/db";
import { competitions, competitionCapacity, competitionVenues, criteria, entries, entryMembers, scores, subjectGroups, timeSlots, events } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { apiRequireRole } from "@/lib/auth/guards";
import { competitionInput } from "@/lib/validation";
import { isGroupAllowed } from "@/lib/groupScope";
import { logAudit } from "@/lib/audit";
import { canEditCompetition, competitionManageGuard, scheduleChangeGuard } from "@/lib/permit";
import { UNLIMITED_CAPACITY, isUnlimited } from "@/lib/domain";
import { findVenueConflicts } from "@/lib/venues";

async function hasEntries(compId: number): Promise<boolean> {
  const rows = await db.select({ id: entries.id }).from(entries).where(eq(entries.competitionId, compId)).limit(1);
  return rows.length > 0;
}

/** มีคนลงทะเบียนอยู่จริงไหม (ไม่นับที่ถอนไปแล้ว) — ใช้ตัดสินว่าเวลาแข่งขันถูกล็อกหรือยัง */
async function hasActiveEntries(compId: number): Promise<boolean> {
  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.competitionId, compId), eq(entries.status, "active")))
    .limit(1);
  return rows.length > 0;
}

/**
 * เลขหมวด (subject_group_catalog.group_no) ของรายการ — ใช้ตัดสินว่าครูอยู่หมวดเดียวกับรายการไหม
 * รายการผูกกับ subjectGroups.id (PK รายปี) แต่ session ของครูถือเลขหมวด จึงต้องแปลงก่อนเทียบ
 */
async function groupCatalogNo(subjectGroupId: number | null): Promise<number | null> {
  if (subjectGroupId == null) return null;
  const g = (
    await db
      .select({ catalogNo: subjectGroups.catalogNo })
      .from(subjectGroups)
      .where(eq(subjectGroups.id, subjectGroupId))
      .limit(1)
  )[0];
  return g?.catalogNo ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * นับผู้ลงทะเบียนที่ยัง active จริงจากตาราง entries
 * ใช้ตอน admin แก้โครงสร้างรายการทั้งที่มีคนลงแล้ว — สร้างแถวโควตาใหม่ต้องคงยอดที่ลงไว้ ไม่ใช่รีเซ็ตเป็น 0
 * (ระดับชั้นของ entry ยึดสมาชิกคนแรก เหมือนตอนลงทะเบียน)
 */
async function countActiveEntries(tx: Tx, compId: number) {
  const ents = await tx
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.competitionId, compId), eq(entries.status, "active")));
  const byLevel: Record<string, number> = {};
  if (!ents.length) return { total: 0, byLevel };

  const mem = await tx
    .select({ id: entryMembers.id, entryId: entryMembers.entryId, level: entryMembers.classLevelSnapshot })
    .from(entryMembers)
    .where(inArray(entryMembers.entryId, ents.map((e) => e.id)));
  mem.sort((a, b) => a.id - b.id);
  const firstLevel = new Map<number, string | null>();
  for (const m of mem) if (!firstLevel.has(m.entryId)) firstLevel.set(m.entryId, m.level);

  for (const e of ents) {
    const lv = firstLevel.get(e.id);
    if (lv) byLevel[lv] = (byLevel[lv] ?? 0) + 1;
  }
  return { total: ents.length, byLevel };
}

/**
 * เขียนเกณฑ์ใหม่แบบจับคู่ตามลำดับ (แก้ของเดิมทับ) แทนการลบทิ้งแล้วสร้างใหม่
 * เพื่อให้ criterion id เดิมอยู่ครบ → คะแนนที่บันทึกไว้แล้วไม่กลายเป็นข้อมูลกำพร้า
 * - เกณฑ์ที่ถูกตัดออก: ลบคะแนนของเกณฑ์นั้นไปด้วย
 * - คะแนนเต็มที่ลดลง: ตัดคะแนนที่เกินลงมาให้เท่าคะแนนเต็มใหม่
 */
async function writeCriteria(tx: Tx, compId: number, next: { name: string; maxScore: number }[]) {
  const old = await tx.select().from(criteria).where(eq(criteria.competitionId, compId));
  old.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const keep = Math.min(old.length, next.length);
  for (let i = 0; i < keep; i++) {
    const max = next[i].maxScore;
    await tx
      .update(criteria)
      .set({ name: next[i].name.trim(), maxScore: max.toFixed(2), sortOrder: i })
      .where(eq(criteria.id, old[i].id));
    await tx
      .update(scores)
      .set({ score: max.toFixed(2) })
      .where(and(eq(scores.criterionId, old[i].id), sql`${scores.score} > ${max.toFixed(2)}::numeric`));
  }
  if (next.length > keep) {
    await tx.insert(criteria).values(
      next.slice(keep).map((c, i) => ({
        competitionId: compId, name: c.name.trim(), maxScore: c.maxScore.toFixed(2), sortOrder: keep + i,
      }))
    );
  }
  if (old.length > keep) {
    const dropIds = old.slice(keep).map((c) => c.id);
    await tx.delete(scores).where(inArray(scores.criterionId, dropIds));
    await tx.delete(criteria).where(inArray(criteria.id, dropIds));
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const id = Number((await params).id);
    const compRows = await db.select().from(competitions).where(eq(competitions.id, id)).limit(1);
    const comp = compRows[0];
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    if (!canEditCompetition(s, comp.createdBy, await groupCatalogNo(comp.subjectGroupId)))
      return fail("ไม่มีสิทธิ์แก้ไขรายการนี้", 403);

    const body = competitionInput.parse(await req.json());

    // งานต้องเป็นงานของปีเดียวกับรายการ
    const event = (
      await db.select().from(events).where(and(eq(events.id, body.eventId), eq(events.yearId, comp.yearId))).limit(1)
    )[0];
    if (!event) return fail("กรุณาเลือกงานที่ถูกต้อง");

    // ต้องอยู่ในช่วงที่งานเปิดให้ครูจัดการรายการ — เช็คทั้งงานเดิม (สิทธิ์แตะรายการนี้)
    // และงานปลายทาง (สิทธิ์เอารายการไปวางไว้ในงานนั้น) ไม่งั้นย้ายงานหนีช่วงล็อกได้
    const curEvent =
      comp.eventId == null || comp.eventId === event.id
        ? null
        : (await db.select().from(events).where(eq(events.id, comp.eventId)).limit(1))[0] ?? null;
    for (const ev of curEvent ? [curEvent, event] : [event]) {
      const guard = competitionManageGuard(s, ev);
      if (!guard.allowed) return fail(guard.message, 403);
    }

    // ครูย้ายหมวดได้เฉพาะหมวดของตัวเอง (คงหมวดเดิมไว้ได้เสมอ; admin เปลี่ยนได้ทุกหมวด)
    if (
      body.subjectGroupId != null &&
      body.subjectGroupId !== comp.subjectGroupId &&
      !(await isGroupAllowed(s, comp.yearId, body.subjectGroupId))
    )
      return fail("เลือกได้เฉพาะหมวดวิชาของท่านเท่านั้น", 403);

    // ช่วงเวลาต้องเป็น slot ของปีเดียวกับรายการ — คัดลอกเวลาเริ่ม/สิ้นสุดจาก slot
    const slot = (
      await db.select().from(timeSlots).where(and(eq(timeSlots.id, body.timeSlotId), eq(timeSlots.yearId, comp.yearId))).limit(1)
    )[0];
    if (!slot) return fail("ช่วงเวลาแข่งขันไม่ถูกต้อง กรุณาเลือกใหม่");

    // มีคนลงทะเบียนอยู่ = เลื่อนวัน/เวลาไม่ได้ (เวลาที่ลงไว้ผ่านการตรวจว่าไม่ชนมาแล้ว ห้ามให้เปลี่ยนทีหลังลอย ๆ)
    // ตรวจก่อนด่านสถานที่ชนกัน เพื่อให้ครูเจอเหตุผลจริงทันที ไม่ใช่ไปติดกล่องยืนยันเรื่องห้องก่อน
    const sched = scheduleChangeGuard(
      s,
      await hasActiveEntries(id),
      { timeSlotId: comp.timeSlotId, eventDate: comp.eventDate },
      { timeSlotId: slot.id, eventDate: body.eventDate || null }
    );
    if (!sched.allowed) return fail(sched.message, 403);

    // ห้องซ้ำในฟอร์มนับครั้งเดียว — คงลำดับที่เลือก
    const venueIds = [...new Set(body.venueIds)];

    // ตรวจสถานที่ชนกัน (ยกเว้นตัวเอง) — ถ้ายังไม่ยืนยันใช้ห้องเดียวกัน
    if (venueIds.length && body.eventDate && !body.forceVenue) {
      const conflicts = await findVenueConflicts({
        venueIds,
        eventDate: body.eventDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        excludeId: id,
      });
      if (conflicts.length) return ok({ venueConflict: true, conflicts });
    }

    // มีคนลงแล้ว = ล็อกโครงสร้าง (ประเภท/ระดับชั้น/เกณฑ์) — ยกเว้น admin ที่แก้ได้ทุกช่อง
    const registered = await hasEntries(id);
    const locked = registered && s.role !== "admin";

    const capRows = await db.select().from(competitionCapacity).where(eq(competitionCapacity.competitionId, id));

    await db.transaction(async (tx) => {
      await tx
        .update(competitions)
        .set({
          name: body.name.trim(),
          description: body.description.trim(),
          visibleToStudents: body.visibleToStudents,
          eventId: body.eventId,
          subjectGroupId: body.subjectGroupId ?? null,
          timeSlotId: slot.id,
          eventDate: body.eventDate || null,
          startTime: slot.startTime,
          endTime: slot.endTime,
          // ไม่มีการแข่งขัน — แก้ได้เสมอ (มีผลกับการออกเกียรติบัตร/การแสดงผล ไม่แตะข้อมูลที่ลงไว้แล้ว)
          noContest: body.noContest,
          // ทีมข้ามห้อง — แก้ได้เสมอ (ไม่กระทบทีมที่ลงไปแล้ว มีผลกับการลงทะเบียนครั้งต่อไปเท่านั้น)
          // ประเภทถูกล็อกเมื่อมีคนลงแล้ว จึงยึด comp.type เดิมในกรณีนั้น
          allowCrossClass: (locked ? comp.type : body.type) === "team" ? body.allowCrossClass : false,
          // เปลี่ยนโครงสร้างได้เฉพาะยังไม่มีคนลง
          ...(locked
            ? {}
            : {
                type: body.type,
                capacityMode: body.type === "individual" ? body.capacityMode ?? "per_level" : "per_level",
                teamSizeMin: body.type === "team" ? body.teamSizeMin ?? null : null,
                teamSizeMax: body.type === "team" ? body.teamSizeMax ?? null : null,
                allowedClassLevels: JSON.stringify(body.allowedClassLevels),
              }),
        })
        .where(eq(competitions.id, id));

      // สถานที่เปลี่ยนได้เสมอ (แม้มีคนลงแล้ว) → rebuild join rows
      await tx.delete(competitionVenues).where(eq(competitionVenues.competitionId, id));
      if (venueIds.length) {
        await tx.insert(competitionVenues).values(
          venueIds.map((vid, i) => ({ competitionId: id, venueId: vid, sortOrder: i }))
        );
      }

      if (!locked) {
        // rebuild capacity + criteria
        // admin แก้รายการที่มีคนลงแล้วได้ → ยอดที่ลงไว้ต้องยกมาใส่แถวใหม่ ไม่งั้นที่นั่งจะว่างผิด
        const counts = registered ? await countActiveEntries(tx, id) : { total: 0, byLevel: {} as Record<string, number> };
        await tx.delete(competitionCapacity).where(eq(competitionCapacity.competitionId, id));
        if (body.type === "individual" && body.capacityMode !== "combined") {
          // ชั้นที่ถูกเอาออกแต่ยังมีคนลงค้างอยู่ ต้องคงแถวไว้ (ไม่งั้นยกเลิกการลงทะเบียนแล้วยอดไม่ลด)
          const open = new Set<string>(body.allowedClassLevels);
          const levels = [...new Set<string>([...open, ...Object.keys(counts.byLevel)])];
          for (const lv of levels) {
            const taken = counts.byLevel[lv] ?? 0;
            const cap = open.has(lv)
              ? body.capacityPerLevel?.[lv] ?? UNLIMITED_CAPACITY
              : taken; // ชั้นที่ปิดรับแล้ว → เต็มพอดี ลงเพิ่มไม่ได้
            await tx.insert(competitionCapacity).values({
              competitionId: id, classLevel: lv, capacity: cap, registeredCount: taken,
            });
          }
        } else {
          await tx.insert(competitionCapacity).values({
            competitionId: id, classLevel: null,
            capacity: (body.type === "team" ? body.teamCapacity : body.combinedCapacity) ?? UNLIMITED_CAPACITY,
            registeredCount: counts.total,
          });
        }
        await writeCriteria(tx, id, body.criteria);
      } else {
        // มีคนลงแล้ว → อัปเดตได้เฉพาะจำนวนรับ (ห้ามต่ำกว่าที่ลงไปแล้ว)
        for (const row of capRows) {
          const newCap =
            comp.type === "team"
              ? body.teamCapacity
              : comp.capacityMode === "combined"
                ? body.combinedCapacity // เดี่ยวแบบรวม → row เดียว (class_level = null)
                : row.classLevel
                  ? body.capacityPerLevel?.[row.classLevel]
                  : undefined;
          // อัปเดตจำนวนรับได้ถ้าเป็นไม่จำกัด หรือไม่ต่ำกว่าจำนวนที่ลงไปแล้ว
          if (newCap != null && (isUnlimited(newCap) || newCap >= row.registeredCount)) {
            await tx.update(competitionCapacity).set({ capacity: newCap }).where(eq(competitionCapacity.id, row.id));
          }
        }
      }
    });

    await logAudit(s.code, "update_competition", { competitionId: id, locked, adminOverride: registered && !locked });
    return ok({ locked });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await apiRequireRole("teacher", "recorder", "admin");
    const id = Number((await params).id);
    const compRows = await db.select().from(competitions).where(eq(competitions.id, id)).limit(1);
    const comp = compRows[0];
    if (!comp) return fail("ไม่พบรายการแข่งขัน", 404);
    if (!canEditCompetition(s, comp.createdBy, await groupCatalogNo(comp.subjectGroupId)))
      return fail("ไม่มีสิทธิ์ลบรายการนี้", 403);

    // นอกช่วงที่งานเปิดให้จัดการรายการ ครูลบรายการไม่ได้ (admin ลบได้เสมอ)
    const ev = comp.eventId == null ? null : (await db.select().from(events).where(eq(events.id, comp.eventId)).limit(1))[0] ?? null;
    const guard = competitionManageGuard(s, ev);
    if (!guard.allowed) return fail(guard.message, 403);

    const active = await db.select({ id: entries.id }).from(entries)
      .where(and(eq(entries.competitionId, id), eq(entries.status, "active"))).limit(1);
    if (active.length) return fail("ลบไม่ได้ เพราะมีนักเรียนลงทะเบียนอยู่ (ต้องยกเลิกการลงทะเบียนก่อน)");

    await db.transaction(async (tx) => {
      await tx.delete(scores).where(eq(scores.entryId, id)); // no-op guard
      await tx.delete(criteria).where(eq(criteria.competitionId, id));
      await tx.delete(competitionCapacity).where(eq(competitionCapacity.competitionId, id));
      await tx.delete(competitionVenues).where(eq(competitionVenues.competitionId, id));
      await tx.delete(competitions).where(eq(competitions.id, id));
    });
    await logAudit(s.code, "delete_competition", { competitionId: id });
    return ok();
  });
}
