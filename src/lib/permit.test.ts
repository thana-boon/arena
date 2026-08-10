// กฎสิทธิ์ที่หน้าเว็บกับ API ต้องตอบตรงกัน — เขียนไว้เพราะทั้งสองฝั่งเคยตัดสินคนละแบบมาแล้ว
process.env.TZ = "Asia/Bangkok";

import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditCompetition, scheduleChangeGuard, withdrawGuard, type Actor } from "./permit";

const NOW = new Date("2026-08-07T10:00:00+07:00");

const teacher = (code: string, group?: number): Actor => ({ role: "teacher", code, subjectGroupId: group });
const admin: Actor = { role: "admin", code: "adm", subjectGroupId: undefined };

// ===== ใครแก้/ลบรายการแข่งขันได้ =====

test("ครูแก้รายการของตัวเองได้ แม้ไม่มีหมวด", () => {
  assert.equal(canEditCompetition(teacher("t1"), "t1", null), true);
});

test("ครูแก้รายการของเพื่อนร่วมหมวดได้ (เทียบด้วยเลขหมวด ไม่ใช่ id รายปี)", () => {
  assert.equal(canEditCompetition(teacher("t1", 4), "t2", 4), true);
});

test("ครูแก้รายการหมวดอื่นไม่ได้ และหมวดที่ว่างไม่นับว่าตรงกัน", () => {
  assert.equal(canEditCompetition(teacher("t1", 4), "t2", 5), false);
  assert.equal(canEditCompetition(teacher("t1", 4), "t2", null), false);
  assert.equal(canEditCompetition(teacher("t1"), "t2", 4), false);
});

test("admin แก้ได้ทุกรายการ · recorder ได้เฉพาะของตัวเอง/หมวดตัวเอง · นักเรียนไม่ได้เลย", () => {
  assert.equal(canEditCompetition(admin, "t2", 9), true);
  assert.equal(canEditCompetition({ role: "recorder", code: "r1" }, "t2", 4), false);
  assert.equal(canEditCompetition({ role: "recorder", code: "r1", subjectGroupId: 4 }, "t2", 4), true);
  assert.equal(canEditCompetition({ role: "student", code: "s1", subjectGroupId: 4 }, "s1", 4), false);
});

// ===== เลื่อนวัน/เวลาแข่งขันได้ไหม =====
// เวลาที่นักเรียนลงไว้ผ่านการตรวจ "ไม่ชนกับรายการอื่น" มาแล้ว ถ้าเลื่อนทีหลังจะไม่มีใครตรวจซ้ำ

const at = (timeSlotId: number | null, eventDate: string | null) => ({ timeSlotId, eventDate });
const slot1 = at(1, "2026-08-20");

test("ไม่มีคนลงทะเบียน → ครูเลื่อนเวลาได้", () => {
  assert.equal(scheduleChangeGuard(teacher("t1"), false, slot1, at(2, "2026-08-21")).allowed, true);
});

test("มีคนลงทะเบียนอยู่ → ครูเปลี่ยนช่วงเวลาหรือวันที่ไม่ได้ พร้อมบอกเหตุผล", () => {
  for (const next of [at(2, "2026-08-20"), at(1, "2026-08-21"), at(1, null)]) {
    const g = scheduleChangeGuard(teacher("t1"), true, slot1, next);
    assert.equal(g.allowed, false);
    assert.match(g.message, /เปลี่ยนวันที่หรือช่วงเวลาแข่งขันไม่ได้/);
  }
});

test("มีคนลงทะเบียนอยู่ แต่ส่งเวลาเดิมมา → ผ่าน (แก้ช่องอื่นได้ตามปกติ)", () => {
  assert.equal(scheduleChangeGuard(teacher("t1"), true, slot1, at(1, "2026-08-20")).allowed, true);
  // ยังไม่เคยระบุวันที่ — "" กับ null คือค่าเดียวกัน ไม่ใช่การแก้ไข
  assert.equal(scheduleChangeGuard(teacher("t1"), true, at(1, null), at(1, null)).allowed, true);
});

test("admin เลื่อนเวลาได้แม้มีคนลงทะเบียนแล้ว", () => {
  assert.equal(scheduleChangeGuard(admin, true, slot1, at(2, "2026-08-21")).allowed, true);
});

// ===== ยกเลิกการลงทะเบียนได้ไหม =====
// ปิดรับสมัครแล้วต้องลบไม่ได้ด้วย ไม่ใช่แค่เพิ่มไม่ได้

const openEvent = { registrationOpen: true, regStart: null, regEnd: null };
const closedEvent = { ...openEvent, regEnd: "2026-08-06T23:59:59+07:00" };

test("อยู่ในช่วงรับสมัคร → ยกเลิกได้ทุก role", () => {
  for (const a of [teacher("t1"), { role: "student" as const, code: "s1" }, admin])
    assert.equal(withdrawGuard(a, openEvent, NOW).allowed, true);
});

test("หมดเวลารับสมัคร → ครูและนักเรียนยกเลิกไม่ได้ พร้อมบอกเหตุผล", () => {
  for (const a of [teacher("t1"), { role: "student" as const, code: "s1" }]) {
    const g = withdrawGuard(a, closedEvent, NOW);
    assert.equal(g.allowed, false);
    assert.match(g.message, /^หมดเวลารับสมัครแล้ว —/);
  }
});

test("admin ยกเลิกได้ตลอด แม้ปิดรับ/ยังไม่เข้างาน", () => {
  assert.equal(withdrawGuard(admin, closedEvent, NOW).allowed, true);
  assert.equal(withdrawGuard(admin, null, NOW).allowed, true);
});

test("รายการที่ยังไม่เข้างาน → ครู/นักเรียนยกเลิกไม่ได้ (ไม่ใช่เปิดโดยปริยาย)", () => {
  assert.equal(withdrawGuard(teacher("t1"), null, NOW).allowed, false);
});
