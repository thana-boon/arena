"use client";
import { useState } from "react";

// basePath (/arena) ไม่ถูกเติมให้ <img src> อัตโนมัติ ต้อง prefix เอง
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * รูปโปรไฟล์ผู้ใช้ — ไม่มีรูป (หรือโหลดรูปไม่ขึ้น) ให้แสดงตัวอักษรแรกของชื่อจริงแทน
 * รูปมาจาก /api/me/photo ซึ่ง proxy จาก SchoolOS ด้วย API key ฝั่ง server
 */
export function Avatar({
  initial,
  hasPhoto,
  className = "",
  size,
}: {
  initial: string;
  hasPhoto: boolean;
  className?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const style = size ? { width: size, height: size } : undefined;

  if (!hasPhoto || failed) {
    return (
      <span className={`avatar ${className}`} style={style} aria-hidden="true">
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก proxy ของเราเอง ไม่ผ่าน next/image
    <img
      src={`${BASE}/api/me/photo`}
      alt=""
      className={`avatar avatar-img ${className}`}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
