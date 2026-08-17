// เกียรติบัตรออกได้หรือยัง (เงื่อนไขระดับงาน + รายการ)
// เขียนไว้เพราะกฎนี้ถูกถามจากสามที่: หน้าออกเกียรติบัตร, ทะเบียนเกียรติบัตร และ API ตอนกดออกใบจริง
// ถ้าตอบไม่ตรงกันจะได้ปุ่มที่กดได้แต่เซิร์ฟเวอร์ปฏิเสธ — หรือแย่กว่า: ป้ายบอกว่าออกไม่ได้แต่ API ปล่อยผ่าน

import { test } from "node:test";
import assert from "node:assert/strict";
import { certIssueGate, CERT_GATE_FIX, type CertGateComp, type CertGateEvent } from "./domain";

const ev = (over: Partial<CertGateEvent> = {}): CertGateEvent => ({
  kind: "competition",
  status: "published",
  ...over,
});

const comp = (over: Partial<CertGateComp> = {}): CertGateComp => ({
  noContest: false,
  isPublished: false,
  attendanceChecked: false,
  ...over,
});

// ===== รายการแข่งขันปกติ: ยึดการประกาศผล =====

test("รายการแข่งขันที่ยังไม่ประกาศผล → ออกใบไม่ได้", () => {
  assert.deepEqual(certIssueGate(ev(), comp()), {
    ready: false,
    code: "not_published",
    reason: "ยังไม่ประกาศผล",
  });
});

test("ประกาศผลแล้ว → ออกใบได้ (ไม่เกี่ยวกับการเช็คชื่อ)", () => {
  assert.equal(certIssueGate(ev(), comp({ isPublished: true })).ready, true);
  // การเช็คชื่อเป็นเรื่องของรายการที่ไม่มีการแข่งขันเท่านั้น ต้องไม่ลามมาบล็อกรายการปกติ
  assert.equal(
    certIssueGate(ev(), comp({ isPublished: true, attendanceChecked: false })).ready,
    true
  );
});

// ===== รายการที่ไม่มีการแข่งขัน: ยึดการเช็คชื่อผู้เข้าร่วมแทน =====

test("ไม่มีการแข่งขัน + ยังไม่เช็คชื่อ → ออกใบไม่ได้ (กันครูลืมเช็คแล้วออกใบให้ทุกคน)", () => {
  assert.deepEqual(certIssueGate(ev(), comp({ noContest: true })), {
    ready: false,
    code: "attendance_pending",
    reason: "ยังไม่เช็คชื่อผู้เข้าร่วม",
  });
});

test("ไม่มีการแข่งขัน + เช็คชื่อแล้ว → ออกใบได้ แม้ไม่เคยประกาศผล", () => {
  const g = certIssueGate(ev(), comp({ noContest: true, attendanceChecked: true }));
  assert.equal(g.ready, true);
  assert.equal(g.reason, "");
});

// ===== งานอบรม: ไม่มีคะแนนทั้งงาน =====

test("งานอบรม → ไม่ต้องประกาศผล และไม่ต้องเช็คชื่อ", () => {
  assert.equal(certIssueGate(ev({ kind: "training" }), comp()).ready, true);
});

test("งานอบรมที่มีรายการติ๊กว่าไม่มีการแข่งขัน → ยังต้องเช็คชื่อ", () => {
  assert.equal(certIssueGate(ev({ kind: "training" }), comp({ noContest: true })).code, "attendance_pending");
});

// ===== เงื่อนไขของ "งาน" ต้องมาก่อนเงื่อนไขของ "รายการ" =====

test("ยังไม่ถูกจัดเข้างาน → ตอบว่ายังไม่มีงาน ไม่ใช่ยังไม่ประกาศผล", () => {
  assert.deepEqual(certIssueGate(null, comp({ noContest: true })), {
    ready: false,
    code: "no_event",
    reason: "ยังไม่ถูกจัดเข้างาน",
  });
});

test("งานยังเป็นฉบับร่าง → บอกต้นทาง (admin ยังตั้งค่าไม่เสร็จ) ไม่ใช่ปลายทาง", () => {
  // ถ้าตอบ "ยังไม่เช็คชื่อ" ครูจะไปเช็คชื่อจนครบแล้วก็ยังออกใบไม่ได้ โดยไม่รู้ว่าติดอะไร
  assert.equal(
    certIssueGate(ev({ status: "draft" }), comp({ noContest: true, attendanceChecked: true })).code,
    "event_draft"
  );
});

// ===== ทุกสาเหตุต้องมีข้อความบอกทางออกให้ API ใช้ตอบ =====

test("ทุกรหัสสาเหตุมีข้อความบอกทางออก", () => {
  for (const code of ["no_event", "event_draft", "not_published", "attendance_pending"] as const) {
    assert.ok(CERT_GATE_FIX[code].length > 0, `ขาดข้อความของ ${code}`);
  }
});
