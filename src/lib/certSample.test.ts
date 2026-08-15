import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSampleData,
  defaultSampleVariant,
  parseSampleVariant,
  pickSampleComp,
  variantForComp,
  type SampleCompetition,
} from "./certificateLayout";

const comp = (over: Partial<SampleCompetition>): SampleCompetition => ({
  id: 1,
  name: "รายการหนึ่ง",
  type: "individual",
  noContest: false,
  isPublished: true,
  studentName: null,
  className: null,
  teamName: null,
  ...over,
});

const comps: SampleCompetition[] = [
  comp({ id: 1, name: "วาดภาพ", studentName: "ด.ช.สั้น ใจดี", className: "ป.4/1" }),
  comp({ id: 2, name: "ตอบปัญหา", studentName: "เด็กหญิงชื่อยาวมาก นามสกุลยาวกว่าเดิมอีก", className: "ม.2/3" }),
  comp({ id: 3, name: "อบรมความปลอดภัย", noContest: true, isPublished: false, studentName: "ด.ญ.กลาง ๆ", className: "ป.6/2" }),
  comp({ id: 4, name: "หุ่นยนต์", type: "team", studentName: "ด.ช.ทีม หนึ่ง", className: "ม.3/1", teamName: "ทีมสิงห์เหนือ" }),
];

const build = (variant = defaultSampleVariant(comps, "competition")) =>
  buildSampleData({ comps, eventName: "งานศิลปหัตถกรรม", yearBe: 2569, dateText: "1 มกราคม 2569", variant });

test("ไม่ได้เลือกรายการ → หยิบคนที่ชื่อยาวที่สุดในงาน (เห็นปัญหาชื่อล้นกรอบก่อน)", () => {
  const d = build();
  assert.equal(d.studentName, "เด็กหญิงชื่อยาวมาก นามสกุลยาวกว่าเดิมอีก");
  assert.equal(d.competitionName, "ตอบปัญหา");
  assert.equal(d.medal, "gold");
  assert.equal(d.rank, 1);
});

test("เลือกรายการอื่น → ชื่อ/ชั้น/ชื่อรายการมาจากผู้สมัครจริงของรายการนั้น", () => {
  const d = build({ ...defaultSampleVariant(comps, "competition"), competitionId: 1 });
  assert.equal(d.studentName, "ด.ช.สั้น ใจดี");
  assert.equal(d.className, "ป.4/1");
  assert.equal(d.competitionName, "วาดภาพ");
});

test("รายการไม่มีการแข่งขัน → เข้าร่วมกิจกรรม และไม่มีอันดับ", () => {
  const v = variantForComp(comps[2], "competition");
  assert.equal(v.award, "activity");
  assert.equal(v.rank, 0);
  const d = build(v);
  assert.equal(d.medal, "activity");
  assert.equal(d.rank, 0);
});

test("งานอบรมทั้งงาน → ทุกใบเป็น 'เข้าร่วม' ไม่มีอันดับ (ตรงกับที่ตอนออกใบจริงทำ)", () => {
  const v = variantForComp(comps[0], "training");
  assert.equal(v.award, "none");
  assert.equal(v.rank, 0);
});

test("ประเภททีมโชว์ชื่อทีมจริง · ปิดสวิตช์แล้วช่องชื่อทีมต้องว่าง", () => {
  const v = variantForComp(comps[3], "competition");
  assert.equal(v.showTeam, true);
  assert.equal(build(v).teamName, "ทีมสิงห์เหนือ");
  assert.equal(build({ ...v, showTeam: false }).teamName, null);
  // ประเภทเดี่ยวไม่มีชื่อทีมตั้งแต่แรก
  assert.equal(variantForComp(comps[0], "competition").showTeam, false);
});

test("งานที่ยังไม่มีรายการ/ยังไม่มีคนสมัคร → ใช้ชื่อสมมติ ไม่ใช่ช่องว่าง", () => {
  const empty = buildSampleData({
    comps: [],
    eventName: "งานใหม่",
    yearBe: 2569,
    dateText: "1 มกราคม 2569",
    variant: defaultSampleVariant([], "competition"),
  });
  assert.ok(empty.studentName.length > 0);
  assert.ok(empty.competitionName.length > 0);
  assert.equal(empty.serialNo, "2569/0000", "ต้องเป็นเลข 0000 เสมอ ไม่ใช่เลขทะเบียนจริง");
});

test("รายการที่ถูกลบไปแล้วแต่ยังค้างอยู่ในลิงก์ → ถอยไปใช้ตัวที่ระบบเลือกให้ ไม่พัง", () => {
  const d = build({ competitionId: 999, award: "silver", rank: 2, showTeam: false });
  assert.equal(d.competitionName, "ตอบปัญหา");
  assert.equal(d.medal, "silver");
  assert.equal(d.rank, 2);
});

test("pickSampleComp: ระบุ id ตรง ๆ ต้องได้ตัวนั้นเสมอ", () => {
  assert.equal(pickSampleComp(comps, 3)?.id, 3);
  assert.equal(pickSampleComp([], 3), null);
});

test("query ของใบทดลองพิมพ์: อ่านค่าที่ใช้ได้ ทิ้งค่ามั่ว ๆ", () => {
  assert.deepEqual(parseSampleVariant({ comp: "4", award: "bronze", rank: "3", team: "1" }), {
    competitionId: 4,
    award: "bronze",
    rank: 3,
    showTeam: true,
  });
  assert.deepEqual(parseSampleVariant({ comp: "abc", award: "platinum", rank: "-1", team: "yes" }), {});
  assert.deepEqual(parseSampleVariant({}), {});
});
