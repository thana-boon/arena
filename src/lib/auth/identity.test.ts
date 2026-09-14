import test from "node:test";
import assert from "node:assert/strict";
import { identityOf, signIdentity, verifyIdentity, type SessionPayload } from "./identity";

/**
 * ===== เทสตัวตนใน session — กันบั๊กที่หายากที่สุดของระบบ SSO =====
 *
 * ข้อที่สำคัญที่สุดคือ "ssoSub ต้องรอดจากการต่ออายุ" — ถ้ามันหล่นตอน re-sign token
 * บั๊ก "ล็อกอินคนใหม่แล้วยังเป็นคนเก่า" จะกลับมาแบบ "หายไป 15 นาทีแล้วโผล่ใหม่"
 * ซึ่งดูเหมือนของหลอนและไล่หาสาเหตุด้วยตาแทบไม่เจอ · จึงต้องยืนยันด้วยเทส ไม่ใช่ดูด้วยตา
 *
 * รัน: npm test
 */

const SECRET = new TextEncoder().encode("secret-สำหรับเทสเท่านั้น-อย่างน้อย-32-ไบต์");

const TEACHER: SessionPayload = {
  role: "admin",
  code: "T00116",
  name: "นายทดสอบ ระบบดี",
  firstName: "ทดสอบ",
  photo: "/api/public/v1/teachers/2/photo",
  subjectGroupId: 4,
  sso: true,
  ssoSub: "T00116",
  abs: Math.floor(Date.now() / 1000) + 8 * 3600,
};

test("identityOf คัดลอก claim ทุกตัวมาครบ รวมถึง ssoSub", () => {
  const identity = identityOf(TEACHER);
  assert.equal(identity.ssoSub, "T00116");
  assert.equal(identity.sso, true);
  assert.equal(identity.abs, TEACHER.abs);
  assert.equal(identity.role, "admin");
  assert.equal(identity.code, "T00116");
  assert.equal(identity.subjectGroupId, 4);
});

test("identityOf ไม่คัดลอก exp ของ token ใบเก่ามาใส่ใบใหม่", () => {
  const identity = identityOf({ ...TEACHER, exp: 1_700_000_000 });
  assert.ok(!("exp" in identity), "exp ต้องมาจาก jose ตอนเซ็นเท่านั้น");
});

test("ssoSub รอดจากการต่ออายุ session (จำลอง touchSession)", async () => {
  // 1) ล็อกอินด้วย SSO → token ใบแรก
  const first = await signIdentity(TEACHER, SECRET, 900);
  const afterLogin = await verifyIdentity(first, SECRET);
  assert.ok(afterLogin);
  assert.equal(afterLogin.ssoSub, "T00116");

  // 2) ต่ออายุ = อ่าน claims จาก token ใบเก่าแล้วเซ็นใบใหม่ (เส้นทางเดียวกับ touchSession)
  const renewed = await signIdentity(afterLogin, SECRET, 900);
  const afterRenew = await verifyIdentity(renewed, SECRET);
  assert.ok(afterRenew);
  assert.equal(afterRenew.ssoSub, "T00116", "ssoSub หล่นตอนต่ออายุ = บั๊ก stale session กลับมาทันที");
  assert.equal(afterRenew.sso, true);
  assert.equal(afterRenew.abs, TEACHER.abs, "เพดานสัมบูรณ์ต้องไม่ถูกรีเซ็ตตอนต่ออายุ");
});

test("ต่ออายุซ้ำหลายรอบแล้ว ssoSub ยังอยู่ครบ", async () => {
  let claims: SessionPayload = TEACHER;
  for (let i = 0; i < 5; i++) {
    const verified = await verifyIdentity(await signIdentity(claims, SECRET, 900), SECRET);
    assert.ok(verified);
    claims = verified;
  }
  assert.equal(claims.ssoSub, "T00116");
  assert.equal(claims.name, TEACHER.name);
});

test("ต่ออายุแล้ว exp ขยับตามอายุใหม่ ไม่ใช่ค่าเดิมของใบเก่า", async () => {
  const short = await verifyIdentity(await signIdentity(TEACHER, SECRET, 60), SECRET);
  assert.ok(short);
  const long = await verifyIdentity(await signIdentity(short, SECRET, 900), SECRET);
  assert.ok(long);
  assert.ok(long.exp != null && short.exp != null && long.exp > short.exp);
});

test("session ที่ล็อกอินด้วยรหัสผ่าน (admin local) ไม่มี sso/ssoSub ติดไปด้วย", async () => {
  const local: SessionPayload = { role: "admin", code: "admin", name: "ผู้ดูแลระบบ" };
  const verified = await verifyIdentity(await signIdentity(local, SECRET, 900), SECRET);
  assert.ok(verified);
  assert.equal(verified.ssoSub, undefined, "ไม่มี ssoSub = SessionGuard ต้องไม่ไปยุ่งกับ session นี้");
  assert.equal(verified.sso, undefined);
});

test("token ที่ลายเซ็นไม่ตรง ต้องไม่ผ่าน", async () => {
  const token = await signIdentity(TEACHER, SECRET, 900);
  const other = new TextEncoder().encode("secret-คนละใบ-ที่ยาวพอ-32-ไบต์-เหมือนกัน");
  assert.equal(await verifyIdentity(token, other), null);
});

/**
 * กับดัก 4.19 — พี่น้องกับ ssoSub ข้างบน แต่แพงกว่า
 *
 * `client` กับ `abs` คือตัวที่กำหนดความยาวนาฬิกาของโทเคนใบถัดไป หล่นตัวใดตัวหนึ่งตอนต่ออายุ
 * session ของมือถือจะถูกมินต์ใหม่เป็น session เดสก์ท็อป 15 นาที — ตัวที่มีไว้ยืดอายุให้เขา
 * กลายเป็นตัวที่เตะเขาออกเอง ตั้งแต่ navigation แรก และหลังจากทำงานถูกต้องมาพักหนึ่งแล้ว
 * อาการที่ผู้ใช้เล่าคือ "มือถือใช้ได้อยู่พักหนึ่งแล้วจู่ ๆ ก็หลุดทุก 15 นาที" ซึ่งแทบหาไม่เจอ
 * ถ้าไม่มีเทสตัวนี้
 */
test("แอปที่ติดตั้งยังเป็นแอปที่ติดตั้งหลังต่ออายุ", async () => {
  const phone: SessionPayload = { ...TEACHER, client: "pwa", abs: null };

  const first = await verifyIdentity(await signIdentity(phone, SECRET, 900), SECRET);
  assert.ok(first);
  assert.equal(first.client, "pwa");
  assert.equal(first.abs, null);

  const renewed = await verifyIdentity(await signIdentity(first, SECRET, 900), SECRET);
  assert.ok(renewed);
  assert.equal(renewed.client, "pwa", "session ของ pwa ที่ต่ออายุแล้วต้องไม่กลายเป็น web");
  assert.equal(renewed.abs, null, "null = แพลตฟอร์มบอกว่าไม่มีเพดาน ต้องไม่ถูกแปลงเป็นเพดานของเรา");
  assert.equal(renewed.ssoSub, "T00116");
});

/**
 * `null` กับ `undefined` เป็นคำตอบคนละอย่างและต้องรอดข้ามการเซ็นโทเคนแยกกัน
 * · null = แพลตฟอร์มบอกว่า "ไม่มีเพดาน" (ค่าปกติของแอปที่ติดตั้ง)
 * · undefined = โทเคนรุ่นเก่าที่ไม่เคยมีฟิลด์นี้ → touchSession ต้องตกไปใช้เพดาน 8 ชม.ของเรา
 */
test("ไม่มีเพดาน กับ ไม่ได้ตอบ ไม่ใช่เรื่องเดียวกัน", async () => {
  const uncapped = await verifyIdentity(
    await signIdentity({ ...TEACHER, client: "pwa", abs: null }, SECRET, 900),
    SECRET,
  );
  assert.ok(uncapped);
  assert.equal(uncapped.abs, null, "null ต้องรอดไปถึงโทเคน");

  const legacy: SessionPayload = { ...TEACHER };
  delete legacy.abs;
  const old = await verifyIdentity(await signIdentity(legacy, SECRET, 900), SECRET);
  assert.ok(old);
  assert.equal(old.abs, undefined, "ไม่มีค่า ต้องยังคงไม่มีค่า ไม่ใช่กลายเป็น null");
});

/** claim ที่หายไปต้องตกไปทางหน้าต่างที่ "สั้นกว่า" เสมอ ไม่ใช่ยาวกว่า */
test("โทเคนที่ออกก่อนรู้จัก pwa ถูกอ่านเป็นเครื่องส่วนกลาง", () => {
  assert.equal(identityOf(TEACHER).client, undefined);
});
