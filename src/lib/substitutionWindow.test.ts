// การเปลี่ยนตัว: สวิตช์แยกเดี่ยว/ทีม + ช่วงเวลาร่วม + admin ข้ามได้ตลอด
// เขียนไว้เพราะเงื่อนไข "เปลี่ยนได้ไหม" ถูกถามจากสามที่ (การ์ดงาน, ตารางรายการ, ตอนบันทึกจริง)
// ถ้าตอบไม่ตรงกันจะกลายเป็นปุ่มกดได้แต่เซิร์ฟเวอร์ปฏิเสธ — ต้องมาจากฟังก์ชันเดียวกันเสมอ
process.env.TZ = "Asia/Bangkok";

import { test } from "node:test";
import assert from "node:assert/strict";
import { substitutionSummary, substitutionWindow, type SubWindowEvent } from "./domain";
import { substitutionGuard } from "./permit";

const NOW = new Date("2026-08-07T10:00:00+07:00");

const ev = (over: Partial<SubWindowEvent> = {}): SubWindowEvent => ({
  subOpenIndividual: false,
  subOpenTeam: false,
  subStart: null,
  subEnd: null,
  ...over,
});

// ===== สวิตช์แยกตามประเภทรายการ =====

test("เปิดเฉพาะทีม → รายการทีมเปลี่ยนได้ รายการเดี่ยวไม่ได้", () => {
  const e = ev({ subOpenTeam: true });
  assert.equal(substitutionWindow(e, "team", NOW).open, true);
  assert.deepEqual(substitutionWindow(e, "individual", NOW), {
    open: false,
    reason: "งานนี้ไม่เปิดให้เปลี่ยนตัวประเภทเดี่ยว",
  });
});

test("เปิดเฉพาะเดี่ยว → รายการเดี่ยวเปลี่ยนได้ รายการทีมไม่ได้", () => {
  const e = ev({ subOpenIndividual: true });
  assert.equal(substitutionWindow(e, "individual", NOW).open, true);
  assert.equal(substitutionWindow(e, "team", NOW).reason, "งานนี้ไม่เปิดให้เปลี่ยนตัวประเภททีม");
});

test("รายการที่ยังไม่ถูกจัดเข้างาน → เปลี่ยนไม่ได้ (ช่วงเวลาเป็นของงาน)", () => {
  assert.deepEqual(substitutionWindow(null, "team", NOW), {
    open: false,
    reason: "รายการนี้ยังไม่ถูกจัดเข้างาน",
  });
});

// ===== ช่วงเวลา (ใช้ร่วมกันทั้งสองประเภท) =====

test("ยังไม่ถึงเวลา / หมดเวลา → ปิดพร้อมเหตุผล แม้สวิตช์เปิดอยู่", () => {
  assert.equal(
    substitutionWindow(ev({ subOpenTeam: true, subStart: "2026-08-08T08:00:00+07:00" }), "team", NOW).reason,
    "ยังไม่ถึงเวลาเปลี่ยนตัว"
  );
  assert.equal(
    substitutionWindow(ev({ subOpenTeam: true, subEnd: "2026-08-06T16:30:00+07:00" }), "team", NOW).reason,
    "หมดเวลาเปลี่ยนตัวแล้ว"
  );
});

test("เว้นช่วงเวลาว่าง = ไม่จำกัด (เปิดค้างจนกว่าจะปิดสวิตช์)", () => {
  assert.equal(substitutionWindow(ev({ subOpenTeam: true }), "team", NOW).open, true);
});

// ===== ป้ายสรุปบนการ์ดงาน =====

test("ปิดทั้งคู่ = ไม่มีป้าย · เปิดอย่างเดียว/ทั้งคู่ = บอกว่าเปิดอะไร", () => {
  assert.equal(substitutionSummary(ev(), NOW), null);
  assert.equal(substitutionSummary(ev({ subOpenTeam: true }), NOW)?.label, "เปลี่ยนตัวได้ (เฉพาะทีม)");
  assert.equal(
    substitutionSummary(ev({ subOpenIndividual: true, subOpenTeam: true }), NOW)?.label,
    "เปลี่ยนตัวได้ (เดี่ยว+ทีม)"
  );
});

test("เปิดสวิตช์แต่หมดเวลาแล้ว → ป้ายบอกว่าปิด ไม่ใช่หายไปเฉย ๆ", () => {
  const s = substitutionSummary(ev({ subOpenTeam: true, subEnd: "2026-08-06T16:30:00+07:00" }), NOW);
  assert.equal(s?.open, false);
  assert.match(s!.label, /หมดเวลาเปลี่ยนตัวแล้ว/);
});

// ===== ใครข้ามช่วงเวลาได้ =====

test("admin เปลี่ยนได้ตลอด แม้งานปิดการเปลี่ยนตัวไว้", () => {
  assert.deepEqual(substitutionGuard({ role: "admin" }, ev(), "team", NOW), { allowed: true, message: "" });
  assert.equal(
    substitutionGuard({ role: "admin" }, ev({ subOpenTeam: true, subEnd: "2026-08-01T00:00:00+07:00" }), "team", NOW)
      .allowed,
    true
  );
});

test("ครู/ผู้บันทึกผล ติดช่วงเวลา · นักเรียนเปลี่ยนไม่ได้ไม่ว่าช่วงไหน", () => {
  const openTeam = ev({ subOpenTeam: true });
  assert.equal(substitutionGuard({ role: "teacher" }, openTeam, "team", NOW).allowed, true);
  assert.equal(substitutionGuard({ role: "recorder" }, openTeam, "team", NOW).allowed, true);
  assert.equal(substitutionGuard({ role: "teacher" }, openTeam, "individual", NOW).allowed, false);
  assert.equal(substitutionGuard({ role: "student" }, openTeam, "team", NOW).allowed, false);
});

test("ครูที่เปลี่ยนไม่ได้ ต้องได้ข้อความที่บอกทางออก (ติดต่อผู้ดูแลระบบ)", () => {
  const g = substitutionGuard({ role: "teacher" }, ev(), "individual", NOW);
  assert.equal(g.allowed, false);
  assert.match(g.message, /ไม่เปิดให้เปลี่ยนตัวประเภทเดี่ยว/);
  assert.match(g.message, /ติดต่อผู้ดูแลระบบ/);
});
