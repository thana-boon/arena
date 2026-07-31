// คำนำหน้าที่ต้องตัดทิ้งก่อนหาตัวอักษรแรก — ชื่อที่เก็บใน session รวมคำนำหน้ามาด้วย
// (เช่น "นายชรินทร์ รีนับถือ") ถ้าไม่ตัด avatar จะขึ้น "น" ของ "นาย" ทุกคน
// เรียงยาวไปสั้น เพื่อให้ "นางสาว" ชนะ "นาง"
const PREFIXES = [
  "ว่าที่ร้อยตรีหญิง",
  "ว่าที่ร้อยตรี",
  "เด็กหญิง",
  "เด็กชาย",
  "นางสาว",
  "ด.ญ.",
  "ด.ช.",
  "นาง",
  "นาย",
  "ดร.",
  "น.ส.",
];

function stripPrefix(name: string): string {
  const s = name.trim();
  for (const p of PREFIXES) {
    if (s.startsWith(p)) return s.slice(p.length).trim();
  }
  return s;
}

/** ตัวอักษรแรกของชื่อจริง — ใช้แทนรูปเมื่อบัญชีไม่มีรูปโปรไฟล์ */
export function nameInitial(name?: string | null, firstName?: string | null): string {
  const base = (firstName ?? "").trim() || stripPrefix(name ?? "");
  return base.charAt(0) || "?";
}
