/**
 * parser CSV ขนาดเล็ก รองรับ:
 * - ค่าที่ครอบด้วยเครื่องหมายคำพูด "..." (มี comma/ขึ้นบรรทัดข้างในได้)
 * - escape เครื่องหมายคำพูดด้วย "" ภายใน field ที่ครอบ quote
 * - ตัดบรรทัดว่างทิ้ง และรองรับทั้ง \r\n และ \n
 * คืนเป็น array ของแถว (แต่ละแถวเป็น array ของ cell ที่ trim แล้ว)
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // ตัด BOM หัวไฟล์ถ้ามี (Excel มักใส่มา)
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    // ข้ามแถวว่าง (ทุก cell ว่าง)
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") pushField();
    else if (ch === "\n") pushRow();
    else if (ch === "\r") {
      /* รอ \n */
    } else field += ch;
  }
  // เก็บ field/row สุดท้ายถ้ายังค้าง
  if (field !== "" || row.length) pushRow();
  return rows;
}
