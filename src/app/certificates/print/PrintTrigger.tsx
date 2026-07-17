"use client";
import { useEffect } from "react";

/** เปิดหน้าต่างพิมพ์อัตโนมัติหลัง mount (ให้รูปพื้นหลังโหลดเสร็จก่อนหนึ่งเฟรม) */
export function PrintTrigger() {
  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
