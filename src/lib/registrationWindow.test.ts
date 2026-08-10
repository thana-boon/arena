// ข้อความบอกวัน-เวลาเป็นเวลาเครื่อง — ตรึง TZ ให้ตรงกับคอนเทนเนอร์จริง (docker-compose ตั้ง Asia/Bangkok)
process.env.TZ = "Asia/Bangkok";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registrationNotice,
  registrationWindow,
  competitionEditNotice,
  competitionEditWindow,
  type NamedRegWindowEvent,
  type NamedCompEditWindowEvent,
} from "./domain";

const NOW = new Date("2026-08-07T10:00:00+07:00");
const open = { registrationOpen: true, regStart: null, regEnd: null };

test("อยู่ในช่วง → เปิดรับ", () => {
  assert.deepEqual(registrationWindow(open, NOW), { open: true, reason: null });
  assert.equal(
    registrationWindow(
      { registrationOpen: true, regStart: "2026-08-01T00:00:00+07:00", regEnd: "2026-08-31T23:59:59+07:00" },
      NOW
    ).open,
    true
  );
});

test("ปิดสวิตช์รับสมัคร / ยังไม่ถึงเวลา / หมดเวลา → ปิดพร้อมเหตุผล", () => {
  assert.deepEqual(registrationWindow({ ...open, registrationOpen: false }, NOW), {
    open: false,
    reason: "ขณะนี้ปิดรับสมัคร",
  });
  assert.equal(
    registrationWindow({ ...open, regStart: "2026-08-08T00:00:00+07:00" }, NOW).reason,
    "ยังไม่ถึงเวลาเปิดรับสมัคร"
  );
  assert.equal(
    registrationWindow({ ...open, regEnd: "2026-08-06T23:59:59+07:00" }, NOW).reason,
    "หมดเวลารับสมัครแล้ว"
  );
});

test("รายการที่ยังไม่เข้างาน → ปิด (ไม่ใช่เปิดโดยปริยาย)", () => {
  assert.deepEqual(registrationWindow(null, NOW), {
    open: false,
    reason: "รายการนี้ยังไม่ถูกจัดเข้างาน",
  });
});

test("รับ Date ได้เหมือน string (แถวจาก drizzle เป็น Date)", () => {
  assert.equal(
    registrationWindow({ ...open, regEnd: new Date("2026-08-06T23:59:59+07:00") }, NOW).open,
    false
  );
});

// ===== ข้อความสรุปสถานะที่ขึ้นหัวหน้าจอ (registrationNotice) =====

const ev = (name: string, e: Partial<NamedRegWindowEvent> = {}): NamedRegWindowEvent => ({
  name,
  ...open,
  ...e,
});

test("ไม่มีงานเลย → บอกว่ายังไม่มีงานที่เปิดรับ", () => {
  assert.deepEqual(registrationNotice([], NOW), {
    open: false,
    title: "ยังไม่มีงานที่เปิดรับสมัคร",
    detail: "",
  });
});

test("หมดเวลา → พาดหัว 'หมดเวลารับสมัครแล้ว' + วันเวลาที่ปิด", () => {
  const n = registrationNotice([ev("ศิลปหัตถกรรม", { regEnd: "2026-08-06T16:30:00+07:00" })], NOW);
  assert.equal(n.open, false);
  assert.equal(n.title, "หมดเวลารับสมัครแล้ว");
  assert.equal(n.detail, "ศิลปหัตถกรรม — ปิดรับเมื่อ 6 ส.ค. 2569 16:30 น.");
});

test("หมดเวลาหลายงาน → ยกงานที่เพิ่งปิดล่าสุดมาเป็นตัวแทน", () => {
  const n = registrationNotice(
    [
      ev("งานเก่า", { regEnd: "2026-07-01T16:30:00+07:00" }),
      ev("งานล่าสุด", { regEnd: "2026-08-05T16:30:00+07:00" }),
    ],
    NOW
  );
  assert.match(n.detail, /^งานล่าสุด/);
});

test("ปิดหมดแต่มีงานที่จะเปิด → บอกวันเปิดรอบหน้าแทนวันที่ปิดไปแล้ว", () => {
  const n = registrationNotice(
    [
      ev("งานที่ปิดไปแล้ว", { regEnd: "2026-08-01T16:30:00+07:00" }),
      ev("งานรอบหน้า", { regStart: "2026-09-01T08:00:00+07:00" }),
    ],
    NOW
  );
  assert.equal(n.title, "ยังไม่ถึงเวลาเปิดรับสมัคร");
  assert.equal(n.detail, "งานรอบหน้า — เปิดรับ 1 ก.ย. 2569 08:00 น.");
});

test("ปิดสวิตช์เฉย ๆ (ไม่ได้ตั้งเวลา) → 'ขณะนี้ปิดรับสมัคร' ไม่มีรายละเอียดเวลา", () => {
  assert.deepEqual(registrationNotice([ev("งาน", { registrationOpen: false })], NOW), {
    open: false,
    title: "ขณะนี้ปิดรับสมัคร",
    detail: "",
  });
});

test("มีงานเปิดอยู่ → เปิด + เตือนเส้นตายเฉพาะงานที่เปิด (เรียงตามวันปิด)", () => {
  const n = registrationNotice(
    [
      ev("งานที่ปิดไปแล้ว", { regEnd: "2026-08-01T16:30:00+07:00" }),
      ev("งานหลัง", { regEnd: "2026-09-10T16:30:00+07:00" }),
      ev("งานหน้า", { regEnd: "2026-08-20T16:30:00+07:00" }),
    ],
    NOW
  );
  assert.equal(n.open, true);
  assert.equal(
    n.detail,
    "งานหน้า — ปิดรับ 20 ส.ค. 2569 16:30 น. · งานหลัง — ปิดรับ 10 ก.ย. 2569 16:30 น."
  );
});

test("เปิดแบบไม่มีกำหนดปิด → เปิดโดยไม่มีรายละเอียดให้เตือน", () => {
  assert.deepEqual(registrationNotice([ev("งานเปิดตลอด")], NOW), {
    open: true,
    title: "เปิดรับสมัคร",
    detail: "",
  });
});

// ===== ช่วงสร้าง/แก้ไขรายการแข่งขัน (competitionEditWindow) =====
// คุมครู ไม่ใช่คุมนักเรียน — เจอครูเข้าไปแก้รายการหลังนักเรียนลงทะเบียนแล้ว

const cw = (e: Partial<NamedCompEditWindowEvent> = {}): NamedCompEditWindowEvent => ({
  name: "งาน",
  compEditOpen: true,
  compEditStart: null,
  compEditEnd: null,
  ...e,
});

test("งานที่เพิ่งอัปเกรดมา (เปิดไว้ ไม่ตั้งเวลา) → แก้ได้เหมือนเดิม", () => {
  assert.deepEqual(competitionEditWindow(cw(), NOW), { open: true, reason: null });
});

test("ปิดสวิตช์ / ยังไม่ถึงเวลา / หมดเวลา → ปิดพร้อมเหตุผลของเรื่องแก้รายการ (ไม่ใช่ข้อความรับสมัคร)", () => {
  assert.equal(
    competitionEditWindow(cw({ compEditOpen: false }), NOW).reason,
    "ขณะนี้ปิดการสร้าง/แก้ไขรายการแข่งขัน"
  );
  assert.equal(
    competitionEditWindow(cw({ compEditStart: "2026-08-08T00:00:00+07:00" }), NOW).reason,
    "ยังไม่ถึงเวลาเปิดให้สร้าง/แก้ไขรายการแข่งขัน"
  );
  assert.equal(
    competitionEditWindow(cw({ compEditEnd: "2026-08-06T23:59:59+07:00" }), NOW).reason,
    "หมดเวลาสร้าง/แก้ไขรายการแข่งขันแล้ว"
  );
});

test("รายการที่ยังไม่เข้างาน → แก้ไม่ได้ (ต้องให้แอดมินจัดเข้างานก่อน)", () => {
  assert.deepEqual(competitionEditWindow(null, NOW), {
    open: false,
    reason: "รายการนี้ยังไม่ถูกจัดเข้างาน",
  });
});

test("แถบสรุปตอนหมดเวลา → บอกวันที่ปิดแก้ไขของงานที่เพิ่งปิด", () => {
  const n = competitionEditNotice(
    [cw({ name: "วันวิชาการ", compEditEnd: "2026-08-05T16:30:00+07:00" })],
    NOW
  );
  assert.equal(n.open, false);
  assert.equal(n.title, "หมดเวลาสร้าง/แก้ไขรายการแข่งขันแล้ว");
  assert.equal(n.detail, "วันวิชาการ — ปิดแก้ไขเมื่อ 5 ส.ค. 2569 16:30 น.");
});

test("แถบสรุปตอนยังเปิด → เตือนเส้นตายล่วงหน้าตั้งแต่เปิดหน้า", () => {
  const n = competitionEditNotice(
    [cw({ name: "วันวิชาการ", compEditEnd: "2026-08-20T16:30:00+07:00" })],
    NOW
  );
  assert.equal(n.open, true);
  assert.equal(n.detail, "วันวิชาการ — แก้ไขได้ถึง 20 ส.ค. 2569 16:30 น.");
});
