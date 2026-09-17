import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mainTemplate, resolveTemplate, type TemplatePick } from "@/lib/certTemplatePick";

const tpl = (p: Partial<TemplatePick> & { id: number }): TemplatePick => ({
  isDefault: false,
  competitionIds: [],
  medalFilter: "",
  ...p,
});

describe("เลือกแม่แบบของใบ (หลายแบบต่อหนึ่งงาน)", () => {
  const main = tpl({ id: 1, isDefault: true });
  const training = tpl({ id: 2, competitionIds: [10, 11] });

  test("รายการที่ผูกไว้กับแบบไหน ได้แบบนั้น ไม่ใช่แบบหลัก", () => {
    assert.equal(resolveTemplate([main, training], "none", 10)?.id, 2);
    assert.equal(resolveTemplate([main, training], "gold", 11)?.id, 2);
  });

  test("รายการที่ไม่ได้ผูกไว้ ตกไปที่แบบหลักของงาน", () => {
    assert.equal(resolveTemplate([main, training], "gold", 99)?.id, 1);
    assert.equal(resolveTemplate([main, training], "gold")?.id, 1);
  });

  test('"เข้าร่วมกิจกรรม" ก็ใช้แบบที่ผูกไว้เหมือนกัน (ไม่มีแม่แบบเฉพาะเหรียญ)', () => {
    assert.equal(resolveTemplate([main, training], "activity", 10)?.id, 2);
    assert.equal(resolveTemplate([main, training], "activity", 12)?.id, 1);
  });

  test("แม่แบบเฉพาะเหรียญยังใช้ได้เหมือนเดิมเมื่อไม่มีการผูกรายการ", () => {
    const gold = tpl({ id: 3, medalFilter: "gold" });
    // แบบเฉพาะเหรียญไม่ได้เป็นแบบหลัก จึงต้องไม่แย่งใบของเหรียญอื่น
    assert.equal(resolveTemplate([main, gold], "silver")?.id, 1);
    assert.equal(resolveTemplate([tpl({ id: 1 }), gold], "gold")?.id, 3);
  });

  test("งานเก่าที่ยังไม่มีธงแบบหลัก ใช้แม่แบบ medalFilter ว่างเป็นตัวตั้ง", () => {
    const legacy = tpl({ id: 7 });
    assert.equal(resolveTemplate([legacy], "gold", 5)?.id, 7);
    assert.equal(mainTemplate([legacy])?.id, 7);
  });

  test("ไม่มีแม่แบบเลย = null (ผู้เรียกต้องเตือนให้ไปตั้งค่าก่อน ไม่ใช่ออกใบเปล่า)", () => {
    assert.equal(resolveTemplate([], "gold", 1), null);
    assert.equal(mainTemplate([]), null);
  });

  test("แบบหลักมาก่อนแบบอื่นเสมอ ไม่ว่าลำดับในอาร์เรย์จะเป็นอย่างไร", () => {
    const other = tpl({ id: 5 });
    assert.equal(mainTemplate([other, main])?.id, 1);
  });
});
