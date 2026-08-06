"use client";
import { useEffect } from "react";
import { fitCertTexts } from "@/lib/certFit";

/**
 * เปิดหน้าต่างพิมพ์อัตโนมัติหลัง mount
 *
 * ก่อนพิมพ์ต้องรอฟอนต์ไทยโหลดเสร็จจริง ๆ ก่อน: การย่อข้อความให้พอดีกรอบวัดจากตัวอักษรที่วาดอยู่
 * ถ้าวัดตอนยังเป็นฟอนต์สำรอง ความกว้างจะคนละเรื่องกับของจริง ย่อออกมาผิดทั้งใบ
 * (ยังคงหน่วงอย่างน้อย 300ms ไว้เผื่อรูปพื้นหลัง และมีเพดานกันค้างถ้าฟอนต์โหลดไม่ขึ้น)
 */
export function PrintTrigger() {
  useEffect(() => {
    let cancelled = false;
    let printed = false;

    const go = () => {
      if (cancelled || printed) return;
      printed = true;
      fitCertTexts(document);
      // ให้เบราว์เซอร์วาดผลการย่ออีกหนึ่งเฟรมก่อน ไม่งั้นภาพที่ส่งเข้าเครื่องพิมพ์เป็นของก่อนย่อ
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    };

    const cap = window.setTimeout(go, 3000);
    const minWait = new Promise<void>((r) => window.setTimeout(r, 300));
    Promise.all([document.fonts?.ready, minWait]).then(go, go);

    return () => {
      cancelled = true;
      window.clearTimeout(cap);
    };
  }, []);
  return null;
}
