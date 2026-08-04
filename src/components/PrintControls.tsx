"use client";
import { useEffect } from "react";
import { Icon } from "@/components/Icon";

/** เด้งหน้าต่างพิมพ์อัตโนมัติหลัง mount + ปุ่มพิมพ์ซ้ำเผื่อผู้ใช้ปิดหน้าต่างพิมพ์ไปก่อน */
export function PrintControls() {
  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="no-print report-print-toolbar">
      <button className="btn btn-primary" onClick={() => window.print()}>
        <Icon name="printer" size={18} /> พิมพ์
      </button>
    </div>
  );
}
