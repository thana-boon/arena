import { test } from "node:test";
import assert from "node:assert/strict";
import { applySigInk, SIG_TUNE_NEW, SIG_TUNE_SAVED, type SigTune } from "./imageCompress";

/** ภาพจำลอง: pixel เรียงเป็นแถวเดียว ระบุเป็น [r,g,b,a] ต่อ pixel */
function strip(px: number[][]) {
  return new Uint8ClampedArray(px.flat());
}
const at = (d: Uint8ClampedArray, i: number) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]];

const WHITE = [255, 255, 255, 255];
const PAPER = [238, 236, 230, 255]; // กระดาษถ่ายจากมือถือ ไม่ขาวสนิท
const BLACK = [10, 10, 10, 255];
const CLEAR = [0, 0, 0, 0];
const BLUE = "#1d4ed8";

test("ลบพื้นหลัง: พื้นขาวโปร่งใส เส้นหมึกยังทึบ", () => {
  const d = strip([WHITE, PAPER, BLACK]);
  applySigInk(d, 3, 1, SIG_TUNE_NEW);
  assert.equal(at(d, 0)[3], 0);
  assert.equal(at(d, 1)[3], 0);
  assert.equal(at(d, 2)[3], 255);
});

test("เปลี่ยนสีหมึก: เส้นดำกลายเป็นน้ำเงินเต็มสี พื้นที่ลบแล้วไม่เหลือสี", () => {
  const d = strip([WHITE, BLACK]);
  applySigInk(d, 2, 1, { ...SIG_TUNE_NEW, ink: BLUE });
  assert.deepEqual(at(d, 1), [0x1d, 0x4e, 0xd8, 255]);
  assert.equal(at(d, 0)[3], 0);
});

test("ขอบเส้นแบบ anti-alias ได้ alpha กลาง ๆ ไม่ใช่หายไปหรือทึบสุด", () => {
  const d = strip([[150, 150, 150, 255]]);
  applySigInk(d, 1, 1, SIG_TUNE_NEW);
  const a = at(d, 0)[3];
  assert.ok(a > 20 && a < 235, `alpha ควรอยู่กลาง ๆ แต่ได้ ${a}`);
});

test("pixel ที่โปร่งใสอยู่แล้วถือเป็นพื้น ไม่ถูกนับเป็นหมึกดำ", () => {
  const d = strip([CLEAR]);
  applySigInk(d, 1, 1, { ...SIG_TUNE_NEW, ink: BLUE });
  assert.equal(at(d, 0)[3], 0);
});

test("เปลี่ยนสีอย่างเดียว (ไม่ลบพื้น): พื้นขาวยังขาว เส้นเป็นสีใหม่", () => {
  const d = strip([WHITE, BLACK]);
  applySigInk(d, 2, 1, { ...SIG_TUNE_SAVED, ink: BLUE });
  assert.deepEqual(at(d, 0), WHITE);
  assert.deepEqual(at(d, 1), [0x1d, 0x4e, 0xd8, 255]);
});

test("ลบพื้นแรงขึ้น เก็บพื้นกระดาษที่มืดกว่าเดิมได้ด้วย", () => {
  const grey = [[200, 198, 195, 255]];
  const soft = strip(grey);
  const hard = strip(grey);
  applySigInk(soft, 1, 1, { ...SIG_TUNE_NEW, bgLevel: 250 });
  applySigInk(hard, 1, 1, { ...SIG_TUNE_NEW, bgLevel: 180 });
  assert.ok(at(soft, 0)[3] > at(hard, 0)[3]);
  assert.equal(at(hard, 0)[3], 0);
});

test("ขอบเขตที่คืนมาครอบเฉพาะเส้นหมึก ใช้ตัดขอบว่างได้", () => {
  // 4x3: หมึกอยู่ที่ (1,1) และ (2,1) เท่านั้น
  const px: number[][] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 4; x++) px.push(y === 1 && (x === 1 || x === 2) ? BLACK : WHITE);
  }
  const b = applySigInk(strip(px), 4, 3, SIG_TUNE_NEW);
  assert.deepEqual(b, { x0: 1, y0: 1, x1: 2, y1: 1 });
});

test("รูปว่างเปล่าไม่มีขอบเขต จะได้ null (ไม่ต้องตัดขอบ)", () => {
  const b = applySigInk(strip([WHITE, WHITE]), 2, 1, SIG_TUNE_NEW);
  assert.equal(b, null);
});

test("ปิดทุกตัวเลือก = ไม่แตะ pixel", () => {
  const off: SigTune = { removeBg: false, bgLevel: 225, ink: null, trim: false };
  const d = strip([WHITE, BLACK]);
  applySigInk(d, 2, 1, off);
  assert.deepEqual([...d], [...strip([WHITE, BLACK])]);
});
