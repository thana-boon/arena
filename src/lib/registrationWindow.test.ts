import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationWindow } from "./domain";

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
