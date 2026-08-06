import { test } from "node:test";
import assert from "node:assert/strict";
import { clampSigScale, sigImageH, sigRect, SIG_IMAGE_SCALE_MAX, SIG_IMAGE_SCALE_MIN } from "./certificateLayout";

const base = { x: 50, y: 70, width: 16, name: "นายสมชาย ใจดี", roleLabel: "ผู้อำนวยการ", fontSize: 1.2 };

test("แม่แบบเก่าที่ไม่มี imageScale ต้องได้ขนาดเดิมเป๊ะ ๆ", () => {
  const legacy = sigImageH({ width: 16, mode: "image" }, "landscape");
  assert.equal(legacy, sigImageH({ width: 16, mode: "image", imageScale: 1 }, "landscape"));
});

test("ขยายเฉพาะรูป: ความสูงรูปโตตามตัวคูณ", () => {
  const h1 = sigImageH({ width: 16, mode: "image", imageScale: 1 }, "landscape");
  const h2 = sigImageH({ width: 16, mode: "image", imageScale: 2 }, "landscape");
  assert.ok(Math.abs(h2 - h1 * 2) < 1e-9);
});

test("เส้นเซ็นสดไม่สนใจ imageScale (คุมด้วยความกว้างกล่องเหมือนเดิม)", () => {
  const line = sigImageH({ width: 16, mode: "blank", imageScale: 3 }, "landscape");
  assert.equal(line, sigImageH({ width: 16, mode: "blank" }, "landscape"));
});

test("กรอบที่ใช้ลากสูงขึ้นตามรูป ส่วนความกว้าง/จุดกึ่งกลางไม่ขยับ", () => {
  const a = sigRect({ ...base, mode: "image", imageScale: 1 }, "landscape");
  const b = sigRect({ ...base, mode: "image", imageScale: 1.5 }, "landscape");
  assert.equal(a.left, b.left);
  assert.equal(a.w, b.w);
  assert.equal(a.top, b.top);
  assert.ok(b.h > a.h, "กรอบต้องสูงขึ้นเมื่อรูปใหญ่ขึ้น");
  // ส่วนที่โตขึ้นต้องเป็นความสูงของรูปล้วน ๆ (ชื่อ/ตำแหน่งขนาดเท่าเดิม)
  const grow = sigImageH({ ...base, mode: "image", imageScale: 1.5 }, "landscape") - sigImageH({ ...base, mode: "image", imageScale: 1 }, "landscape");
  assert.ok(Math.abs(b.h - a.h - grow) < 1e-9);
});

test("ค่าที่พิมพ์มั่ว ๆ ถูกบีบให้อยู่ในช่วงที่ใช้ได้", () => {
  assert.equal(clampSigScale(99), SIG_IMAGE_SCALE_MAX);
  assert.equal(clampSigScale(0), SIG_IMAGE_SCALE_MIN);
  assert.equal(clampSigScale(Number.NaN), 1);
});
