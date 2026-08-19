"use client";
import { useEffect } from "react";
import { fitCertTexts } from "@/lib/certFit";

/**
 * งานฝั่งเบราว์เซอร์ของหน้าเกียรติบัตร ทำสามอย่างตามลำดับนี้เท่านั้น
 *   1. รอฟอนต์ไทยโหลดจริง แล้วย่อข้อความที่ล้นกรอบให้พอดี (fitCertTexts)
 *   2. ย่อ "ทั้งใบ" ให้พอดีความกว้างจอ (fitToScreen) — เฉพาะบนจอ ไม่แตะตอนพิมพ์
 *   3. เปิดหน้าต่างพิมพ์
 *
 * ลำดับสำคัญ: fitCertTexts วัดความกว้างตัวอักษรจาก getBoundingClientRect
 * ถ้าย่อทั้งใบไปก่อน ค่าที่วัดได้จะเป็นพิกเซลหลังย่อ (บนมือถือเหลือ ~1 ใน 3)
 * ความละเอียดที่ใช้ตัดสินว่า "ล้นหรือยัง" หายไปด้วย — บางชื่อจะรอดมาแบบล้นเศษ ๆ ตอนพิมพ์
 */
export function CertPrintClient() {
  useEffect(() => {
    let cancelled = false;
    let printed = false;

    /**
     * A4 บนจอกว้าง 297mm ≈ 1123px — มือถือกว้าง ~390px จึงเห็นแค่มุมซ้ายบนแล้วต้องเลื่อนหาเอง
     * ย่อด้วย transform: scale ไม่ใช่ลด pageWidth เพราะทุกพิกัดในใบผูกกับ --page-w เป็น mm
     * ที่พิมพ์ออกกระดาษจึงไม่ขยับสักจุด และข้อความยังเป็น DOM จริง ผู้ใช้ซูมสองนิ้วเข้าไปอ่านได้คมชัด
     */
    const fitToScreen = () => {
      for (const page of Array.from(document.querySelectorAll<HTMLElement>(".cert-page"))) {
        const sheet = page.firstElementChild as HTMLElement | null;
        const root = page.parentElement;
        if (!sheet || !root) continue;
        // offsetWidth/Height ไม่สนใจ transform → อ่านได้ขนาดจริงของกระดาษเสมอ แม้ย่อค้างอยู่แล้ว
        const w = sheet.offsetWidth;
        const h = sheet.offsetHeight;
        if (!w || !h) continue;
        const cs = getComputedStyle(root);
        const avail = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (avail <= 0) continue;
        // ไม่ขยายเกินขนาดจริง (จอใหญ่เห็นเท่าเดิม) — ย่อได้อย่างเดียว
        const s = Math.min(1, avail / w);
        page.style.setProperty("--cert-s", String(s));
        page.style.setProperty("--cert-w", `${w * s}px`);
        page.style.setProperty("--cert-h", `${h * s}px`);
      }
    };

    const go = () => {
      if (cancelled || printed) return;
      printed = true;
      fitCertTexts(document);
      fitToScreen();
      // ให้เบราว์เซอร์วาดผลการย่ออีกหนึ่งเฟรมก่อน ไม่งั้นภาพที่ส่งเข้าเครื่องพิมพ์เป็นของก่อนย่อ
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    };

    const cap = window.setTimeout(go, 3000);
    const minWait = new Promise<void>((r) => window.setTimeout(r, 300));
    Promise.all([document.fonts?.ready, minWait]).then(go, go);

    // หมุนจอ/เปลี่ยนขนาดหน้าต่างแล้วต้องพอดีใหม่ (ข้อความในใบไม่ต้องย่อซ้ำ ขนาดใบเป็น mm คงที่)
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitToScreen);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.clearTimeout(cap);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return null;
}
