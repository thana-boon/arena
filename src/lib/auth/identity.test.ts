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
