/**
 * ===== เขียนไฟล์ .xlsx เอง (ไม่พึ่งไลบรารีภายนอก) =====
 *
 * โปรเจกต์นี้ไม่มี dependency สำหรับ Excel และไม่อยากเพิ่มเพื่อฟีเจอร์เดียว
 * ทางเลือกที่ถูกกว่าอย่าง CSV ก็มี แต่ครูเปิดด้วยการดับเบิลคลิกแล้วภาษาไทยเพี้ยนได้ง่าย
 * (ขึ้นกับ locale ของเครื่อง) จึงเขียน .xlsx จริงออกไป — เปิดแล้วอ่านออกแน่นอนทุกเครื่อง
 *
 * .xlsx = ไฟล์ zip ที่ข้างในเป็น XML ไม่กี่ไฟล์ ที่นี่จึงมีของสองส่วน:
 * 1) zip แบบ deflate (ใช้ zlib ของ node) พร้อม CRC32 ที่ต้องคำนวณเอง
 * 2) XML ของ workbook/worksheet/styles แบบน้อยที่สุดที่ Excel ยอมเปิด
 *
 * ข้อความทุกช่องเขียนเป็น inlineStr (ไม่ใช้ sharedStrings) — ไฟล์ใหญ่ขึ้นนิดหน่อย
 * แลกกับโค้ดที่สั้นลงมาก และไฟล์รายงานของเราหลักพันแถวเท่านั้น
 */
import { deflateRawSync } from "node:zlib";

/** ค่าในช่อง: ตัวเลขเขียนเป็นตัวเลขจริง (คำนวณ/เรียงใน Excel ได้), null/"" = ปล่อยว่าง */
export type XlsxCell = string | number | null | undefined;

export type XlsxSheet = {
  /** ชื่อแท็บ — จะถูกตัดอักขระต้องห้ามและความยาวให้เองตามกติกาของ Excel */
  name: string;
  /** แถวแรกถือเป็นหัวตารางเสมอ (ตัวหนา + ตรึงแถว + ใส่ตัวกรอง) */
  rows: XlsxCell[][];
  /** ความกว้างคอลัมน์ (หน่วยเดียวกับที่ Excel ใช้ ≈ จำนวนตัวอักษร) — ไม่ใส่ = ปล่อยตามค่าเริ่มต้น */
  colWidths?: number[];
};

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** สร้างไฟล์ .xlsx จากตารางหลายแผ่น — คืน Buffer พร้อมส่งเป็น response ได้เลย */
export function buildXlsx(sheets: XlsxSheet[]): Buffer {
  const list = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const files: ZipEntry[] = [
    { name: "[Content_Types].xml", data: buf(contentTypesXml(list.length)) },
    { name: "_rels/.rels", data: buf(rootRelsXml()) },
    { name: "xl/workbook.xml", data: buf(workbookXml(list)) },
    { name: "xl/_rels/workbook.xml.rels", data: buf(workbookRelsXml(list.length)) },
    { name: "xl/styles.xml", data: buf(stylesXml()) },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: buf(sheetXml(s)) })),
  ];
  return zip(files);
}

const buf = (s: string) => Buffer.from(s, "utf8");

/** "A", "B", ... "Z", "AA" — คอลัมน์ที่ i (เริ่มจาก 0) */
function colRef(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

function esc(v: string): string {
  return (
    v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // อักขระควบคุมที่ XML 1.0 ไม่รับ — ถ้าหลุดไปแม้ตัวเดียว Excel จะฟ้องว่าไฟล์เสียแล้วไม่เปิดให้เลย
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

/** ชื่อแท็บตามกติกา Excel: ห้ามมี : \ / ? * [ ] และยาวไม่เกิน 31 ตัวอักษร */
function safeSheetName(name: string, index: number): string {
  const s = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return s || `Sheet${index + 1}`;
}

function cellXml(ref: string, v: XlsxCell, header: boolean): string {
  if (v == null || v === "") return ""; // ช่องว่างไม่ต้องเขียนลงไฟล์
  const style = header ? ' s="1"' : "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const { rows } = sheet;
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const dim = rows.length && maxCols ? `A1:${colRef(maxCols - 1)}${rows.length}` : "A1";
  const cols = sheet.colWidths?.length
    ? `<cols>${sheet.colWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";
  const body = rows
    .map((cells, ri) => {
      const inner = cells.map((v, ci) => cellXml(`${colRef(ci)}${ri + 1}`, v, ri === 0)).join("");
      return `<row r="${ri + 1}">${inner}</row>`;
    })
    .join("");
  // ตรึงหัวตาราง + ใส่ตัวกรอง เฉพาะเมื่อมีข้อมูลใต้หัวจริง ๆ (ไฟล์รายงานยาวหลายร้อยแถว เลื่อนแล้วต้องยังเห็นหัว)
  const hasBody = rows.length > 1 && maxCols > 0;
  const pane = hasBody
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
    : "";
  const filter = hasBody ? `<autoFilter ref="${dim}"/>` : "";
  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}"><dimension ref="${dim}"/>${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData>${filter}</worksheet>`;
}

function workbookXml(sheets: XlsxSheet[]): string {
  const tabs = sheets
    .map((s, i) => `<sheet name="${esc(safeSheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${tabs}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount: number): string {
  const rels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join("");
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheetCount + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`;
}

function rootRelsXml(): string {
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function contentTypesXml(sheetCount: number): string {
  const sheetsCt = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetsCt}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

/**
 * สไตล์เท่าที่ใช้จริง: ปกติ (s=0) กับหัวตารางตัวหนา (s=1)
 * ฟอนต์ Tahoma เพราะมีสระ/วรรณยุกต์ไทยครบทุกเครื่องที่โรงเรียนใช้ (Calibri ต้องพึ่ง fallback)
 */
function stylesXml(): string {
  return `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

// ===== zip (deflate) =====

type ZipEntry = { name: string; data: Buffer };

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return (CRC_TABLE = t);
}

function crc32(data: Buffer): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dosTime = (d: Date) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d: Date) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/** zip แบบเรียบที่สุด: ทุกไฟล์ deflate, ไม่มีโฟลเดอร์ entry, ไม่มี zip64 (ไฟล์รายงานไม่ถึง 4GB แน่) */
function zip(entries: ZipEntry[]): Buffer {
  const now = new Date();
  const time = dosTime(now);
  const date = dosDate(now);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const body = deflateRawSync(e.data);
    const crc = crc32(e.data);

    const local = Buffer.alloc(30 + name.length); // alloc = ศูนย์ทั้งก้อน ช่องที่ไม่ได้เขียนจึงเป็น 0 ตามที่ต้องการ
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // ต้องใช้ zip เวอร์ชัน 2.0 ขึ้นไป
    local.writeUInt16LE(0x0800, 6); // ธง: ชื่อไฟล์เป็น UTF-8
    local.writeUInt16LE(8, 8); // วิธีบีบอัด: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    parts.push(local, body);

    const cd = Buffer.alloc(46 + name.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    name.copy(cd, 46);
    central.push(cd);

    offset += local.length + body.length;
  }

  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, dir, end]);
}
