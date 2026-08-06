import { test } from "node:test";
import assert from "node:assert/strict";
import { fitCertTexts } from "./certFit";
import { autoFitMaxW, blockShrinks, type CertBlock } from "./certificateLayout";

/**
 * DOM จำลองเท่าที่ fitCertTexts ใช้จริง (querySelectorAll / parentElement / getBoundingClientRect / style.fontSize)
 * ความกว้างข้อความคิดแบบง่าย ๆ ว่าแปรตรงกับขนาดตัวอักษร ซึ่งเป็นสมมติฐานเดียวกับที่ตัวย่อใช้
 */
function makeSpan(opts: {
  /** ความกว้างข้อความที่ขนาดเต็ม 100% (px) */
  natural: number;
  /** ความกว้างกรอบคงที่ (px) — ไม่ใส่ = กรอบพอดีข้อความ (โตตามข้อความ แต่ไม่เกิน maxWidth) */
  boxW?: number;
  /** เพดานของกรอบพอดีข้อความ (px) */
  maxWidth?: number;
  /** ปิดการย่อ (data-cert-fit="off") */
  off?: boolean;
}) {
  const span = {
    style: { fontSize: "" } as { fontSize: string },
    getAttribute: (_k: string) => (opts.off ? "off" : ""),
    parentElement: null as unknown as { getBoundingClientRect(): { width: number } },
    scale() {
      const v = this.style.fontSize;
      return v ? Number(v.replace("%", "")) / 100 : 1;
    },
    getBoundingClientRect() {
      return { width: opts.natural * this.scale() };
    },
  };
  span.parentElement = {
    getBoundingClientRect() {
      const content = span.getBoundingClientRect().width;
      if (opts.boxW != null) return { width: opts.boxW };
      return { width: Math.min(content, opts.maxWidth ?? Infinity) };
    },
  };
  return span;
}

function rootOf(spans: unknown[]) {
  return { querySelectorAll: () => spans } as unknown as ParentNode;
}

test("ข้อความสั้นกว่ากรอบ ไม่ถูกแตะ", () => {
  const s = makeSpan({ natural: 120, boxW: 300 });
  fitCertTexts(rootOf([s]));
  assert.equal(s.style.fontSize, "");
});

test("ข้อความยาวเกินกรอบคงที่ ถูกย่อจนไม่ล้น", () => {
  const s = makeSpan({ natural: 600, boxW: 300 });
  fitCertTexts(rootOf([s]));
  assert.ok(s.style.fontSize.endsWith("%"), `ต้องตั้งขนาดเป็น % แต่ได้ "${s.style.fontSize}"`);
  assert.ok(s.getBoundingClientRect().width <= 300, "ย่อแล้วต้องไม่ล้นกรอบ");
  assert.ok(s.getBoundingClientRect().width > 297, "ย่อเกินจำเป็นไม่ได้ ต้องเกือบเต็มกรอบ");
});

test("กรอบพอดีข้อความ (กรอบโตตามข้อความ) ย่อลงมาหยุดที่เพดาน ไม่ย่อวนจนหาย", () => {
  const s = makeSpan({ natural: 800, maxWidth: 400 });
  fitCertTexts(rootOf([s]));
  const w = s.getBoundingClientRect().width;
  assert.ok(w <= 400 && w > 396, `ต้องพอดีเพดาน 400 แต่ได้ ${w}`);
});

test("เรียกซ้ำหลายรอบได้ผลเท่าเดิม (ไม่ย่อสะสม)", () => {
  const s = makeSpan({ natural: 600, boxW: 300 });
  fitCertTexts(rootOf([s]));
  const once = s.style.fontSize;
  fitCertTexts(rootOf([s]));
  fitCertTexts(rootOf([s]));
  assert.equal(s.style.fontSize, once);
});

test("ข้อความที่เคยถูกย่อ แล้วกรอบขยายทีหลัง ต้องกลับไปขนาดเต็ม", () => {
  const s = makeSpan({ natural: 600, boxW: 300 });
  fitCertTexts(rootOf([s]));
  assert.notEqual(s.style.fontSize, "");
  const wide = makeSpan({ natural: 600, boxW: 900 });
  wide.style = s.style; // ใช้ style ก้อนเดิม เหมือน element เดิมที่ถูกย่อค้างไว้
  fitCertTexts(rootOf([wide]));
  assert.equal(wide.style.fontSize, "");
});

test("ปิดการย่อทีหลัง ต้องล้างขนาดที่เคยย่อค้างไว้ ไม่ใช่ค้างเล็กตลอดไป", () => {
  const on = makeSpan({ natural: 600, boxW: 300 });
  fitCertTexts(rootOf([on]));
  assert.notEqual(on.style.fontSize, "");
  const off = makeSpan({ natural: 600, boxW: 300, off: true });
  off.style = on.style; // element เดิมที่ถูกย่อค้างไว้ แล้วผู้ใช้เพิ่งปิดสวิตช์ "ย่อพอดีกรอบ"
  fitCertTexts(rootOf([off]));
  assert.equal(off.style.fontSize, "");
});

test("ไม่ย่อต่ำกว่าเพดานล่าง — เล็กจนอ่านไม่ออกแล้วปล่อยล้นดีกว่า", () => {
  const s = makeSpan({ natural: 10000, boxW: 100 });
  fitCertTexts(rootOf([s]));
  assert.equal(s.style.fontSize, "35%");
});

const block = (p: Partial<CertBlock>): CertBlock => ({
  id: "b1", kind: "student_name", x: 50, y: 20, w: 60,
  align: "center", fontSize: 3, font: "th-serif", weight: 400, color: "#000", ...p,
});

test("แม่แบบเก่าที่ไม่มีค่า shrink ถือว่าเปิดย่อ / QR ไม่เกี่ยว", () => {
  assert.equal(blockShrinks(block({})), true);
  assert.equal(blockShrinks(block({ shrink: false })), false);
  assert.equal(blockShrinks(block({ kind: "qr" })), false);
});

test("เพดานของกรอบพอดีข้อความ = ขอบกระดาษด้านที่ชนก่อน", () => {
  assert.equal(autoFitMaxW({ x: 50, align: "center" }), 100);
  assert.equal(autoFitMaxW({ x: 30, align: "center" }), 60); // ยืดสองข้างพร้อมกัน ได้แค่ 2×30
  assert.equal(autoFitMaxW({ x: 8, align: "left" }), 92);
  assert.equal(autoFitMaxW({ x: 92, align: "right" }), 92);
});
