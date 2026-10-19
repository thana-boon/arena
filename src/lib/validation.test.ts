import { test } from "node:test";
import assert from "node:assert/strict";
import { competitionInput } from "./validation";
import { UNLIMITED_CAPACITY } from "./domain";

const base = { name: "อบรม AI", eventId: 1, timeSlotId: 1 };

test("กิจกรรมของครู: บังคับเป็นเดี่ยว ไม่มีการแข่งขัน ซ่อนจากนักเรียน ไม่มีระดับชั้น/เกณฑ์", () => {
  const v = competitionInput.parse({
    ...base,
    participantType: "teacher",
    type: "team",
    teamSizeMin: 2,
    teamSizeMax: 3,
    visibleToStudents: true,
    allowedClassLevels: ["ม.1"],
    criteria: [{ name: "x", maxScore: 10 }],
  });
  assert.equal(v.type, "individual");
  assert.equal(v.noContest, true);
  assert.equal(v.visibleToStudents, false);
  assert.deepEqual(v.allowedClassLevels, []);
  assert.deepEqual(v.criteria, []);
  assert.equal(v.capacityMode, "combined");
  assert.equal(v.combinedCapacity, UNLIMITED_CAPACITY);
});

test("กิจกรรมของครูไม่ต้องเลือกระดับชั้น แต่รายการของนักเรียนยังต้องเลือก", () => {
  assert.doesNotThrow(() => competitionInput.parse({ ...base, participantType: "teacher", type: "individual" }));
  assert.throws(() => competitionInput.parse({ ...base, type: "individual" }), /เลือกระดับชั้นอย่างน้อย 1 ระดับ/);
});

test("ไม่ส่ง participantType = นักเรียน (รายการเดิมพฤติกรรมไม่เปลี่ยน)", () => {
  const v = competitionInput.parse({ ...base, type: "individual", allowedClassLevels: ["ป.1"] });
  assert.equal(v.participantType, "student");
  assert.equal(v.visibleToStudents, true);
});
