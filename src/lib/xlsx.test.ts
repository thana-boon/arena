import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { buildXlsx } from "./xlsx";

/**
 * .xlsx ที่เราเขียนเองพังได้แบบเงียบ ๆ (Excel บอกแค่ "ไฟล์เสียหาย" ไม่บอกว่าตรงไหน)
 * เทสจึงแกะ zip กลับออกมาเองแล้วดูข้างใน — ถ้า CRC/ขนาด/โครง XML เพี้ยน จะรู้ตั้งแต่ตรงนี้
 */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const rawSize = buf.readUInt32LE(i + 22);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.toString("utf8", i + 30, i + 30 + nameLen);
    const start = i + 30 + nameLen + extraLen;
    const body = buf.subarray(start, start + compSize);
    const data = method === 8 ? inflateRawSync(body) : body;
    assert.equal(data.length, rawSize, `ขนาดจริงของ ${name} ไม่ตรงกับที่บันทึกไว้ใน header`);
    out.set(name, data.toString("utf8"));
    i = start + compSize;
  }
  return out;
}

test("buildXlsx: ได้ zip ที่แกะกลับมาได้ครบทุกส่วนที่ Excel ต้องใช้", () => {
  const buf = buildXlsx([{ name: "แผ่นแรก", rows: [["ชื่อ"], ["ก"]] }]);
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  const files = unzip(buf);
  for (const part of [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
  ]) {
    assert.ok(files.has(part), `ขาดไฟล์ ${part}`);
  }
  // ท้ายไฟล์ต้องเป็น end of central directory ไม่งั้นโปรแกรมแกะ zip จะหาสารบัญไม่เจอ
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
});

test("buildXlsx: ข้อความไทย/ตัวเลข/ช่องว่าง ลงเซลล์ตามชนิดที่ควรเป็น", () => {
  const files = unzip(
    buildXlsx([{ name: "ทดสอบ", rows: [["ชื่อ-สกุล", "จำนวน"], ["เด็กชาย ก & ข", 12], ["", null]] }])
  );
  const sheet = files.get("xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">เด็กชาย ก &amp; ข<\/t>/);
  assert.match(sheet, /<c r="B2"><v>12<\/v><\/c>/); // ตัวเลขต้องเป็นตัวเลขจริง ไม่ใช่ข้อความ
  assert.match(sheet, /<row r="3"><\/row>/); // ช่องว่างไม่ต้องเขียนเซลล์
  assert.match(sheet, /<c r="A1" s="1"/); // หัวตารางใช้สไตล์ตัวหนา
  assert.match(sheet, /<autoFilter ref="A1:B3"\/>/);
});

test("buildXlsx: ชื่อแท็บที่ Excel ไม่ยอมรับถูกตัดให้ปลอดภัย", () => {
  const files = unzip(buildXlsx([{ name: "ราย/ชื่อ[2569]", rows: [["ก"]] }]));
  const wb = files.get("xl/workbook.xml")!;
  assert.ok(!/[[\]/]/.test(wb.split('name="')[1].split('"')[0]));
});

test("buildXlsx: อักขระควบคุมที่ทำให้ Excel เปิดไฟล์ไม่ขึ้น ถูกตัดทิ้ง", () => {
  const files = unzip(buildXlsx([{ name: "s", rows: [["หัว"], ["ก\u0000ข\u0007"]] }]));
  const sheet = files.get("xl/worksheets/sheet1.xml")!;
  assert.ok(!/[\u0000-\u001F]/.test(sheet));
  assert.match(sheet, /กข/);
});
