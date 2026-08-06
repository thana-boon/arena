/**
 * ย่อข้อความให้พอดีกรอบ — แบบเดียวกับ "กล่องข้อความ + ย่อข้อความเมื่อล้น" ใน Word
 *
 * ทำด้วย CSS ล้วนไม่ได้: ความกว้างจริงของข้อความไทยขึ้นกับฟอนต์/น้ำหนัก/สระ-วรรณยุกต์
 * รู้ได้ก็ต่อเมื่อวาดลงจอแล้วเท่านั้น จึงต้องวัดจาก DOM แล้วย่อขนาดตัวอักษรตามสัดส่วน
 *
 * ย่อทั้งตัว (font-size %) ไม่ใช่บีบแนวนอน (scaleX) — ตัวอักษรจึงไม่ผอมผิดรูป
 * และไม่ตัดบรรทัดใหม่เด็ดขาด (ข้อความวาดแบบ nowrap อยู่แล้ว) ชื่อยาวแค่ไหนก็ยังอยู่บรรทัดเดียว
 *
 * ต้องเรียกหลังฟอนต์โหลดเสร็จ (document.fonts.ready) ไม่งั้นวัดได้ความกว้างของฟอนต์สำรอง
 */

/**
 * แอตทริบิวต์ที่ CertificateCanvas ติดไว้ให้ทุกข้อความ (ต้องตรงกับค่านี้)
 * ค่า "off" = บล็อกนี้ปิดการย่อ — ยังต้องกวาดมาล้างขนาดเดิมด้วย ไม่งั้นค่าที่เคยย่อไว้ค้างอยู่บน DOM
 */
export const FIT_ATTR = "data-cert-fit";
const OFF = "off";

/** ต่างกันไม่ถึงเท่านี้ (px) ถือว่าพอดีแล้ว — กันย่อวนเพราะเศษทศนิยม */
const EPS = 0.25;
/** ย่อได้ต่ำสุดกี่เท่าของขนาดที่ตั้งไว้ — ต่ำกว่านี้อ่านไม่ออก ปล่อยให้ล้นดีกว่าเพราะจะได้เห็นว่าผิดปกติ */
const MIN_SCALE = 0.35;
/** รอบวัดซ้ำ — ความกว้างไม่ได้แปรตามขนาดฟอนต์แบบเป๊ะ ๆ (hinting/ปัดพิกเซล) รอบสองจึงเก็บเศษที่เหลือ */
const PASSES = 3;

/**
 * ย่อทุกข้อความใน root ที่ล้นกรอบของตัวเองให้พอดี (ข้อความที่ไม่ล้นไม่ถูกแตะ)
 * เรียกซ้ำได้เรื่อย ๆ — เริ่มด้วยการคืนขนาดเดิมทุกตัวก่อนวัดเสมอ ผลจึงไม่สะสม
 */
export function fitCertTexts(root: ParentNode | null | undefined): void {
  if (!root) return;
  const all = Array.from(root.querySelectorAll<HTMLElement>(`[${FIT_ATTR}]`));
  if (!all.length) return;

  // คืนขนาดเต็มให้ทุกตัวก่อนวัด — รวมตัวที่ปิดการย่อไว้ ไม่งั้นของที่เคยย่อค้างอยู่ไม่กลับมาเท่าเดิม
  const scale = new Map<HTMLElement, number>();
  for (const s of all) {
    s.style.fontSize = "";
    scale.set(s, 1);
  }
  const spans = all.filter((s) => s.getAttribute(FIT_ATTR) !== OFF);
  if (!spans.length) return;

  for (let pass = 0; pass < PASSES; pass++) {
    // วัดให้ครบก่อนค่อยเขียน — สลับอ่าน/เขียนทีละตัวทำให้เบราว์เซอร์คำนวณ layout ใหม่ทุกครั้ง
    const todo: Array<[HTMLElement, number]> = [];
    for (const s of spans) {
      const box = s.parentElement;
      if (!box) continue;
      const avail = box.getBoundingClientRect().width;
      const need = s.getBoundingClientRect().width;
      if (!avail || !need || need <= avail + EPS) continue;
      const next = Math.max(MIN_SCALE, (scale.get(s) ?? 1) * (avail / need));
      if (next < (scale.get(s) ?? 1) - 0.0005) todo.push([s, next]);
    }
    if (!todo.length) break;
    for (const [s, v] of todo) {
      scale.set(s, v);
      // ปัดลงเสมอ — ขาดอีกเศษพิกเซลเดียวก็โดนกรอบตัดแล้ว
      s.style.fontSize = `${Math.floor(v * 1000) / 10}%`;
    }
  }
}
