"use client";
import { useState } from "react";

// basePath (/arena) ไม่ถูกเติมให้ <img src> อัตโนมัติ ต้อง prefix เอง
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * รูปโปรไฟล์ผู้ใช้ — ไม่มีรูป (หรือโหลดรูปไม่ขึ้น) ให้แสดงตัวอักษรแรกของชื่อจริงแทน
 * รูปมาจาก /api/me/photo ซึ่ง proxy จาก SchoolOS ด้วย API key ฝั่ง server
 *
 * @param owner รหัสของเจ้าของรูป (session.code) — ใส่เป็น query เพื่อให้ URL ของแต่ละคนไม่ซ้ำกัน
 *   ⚠ server ไม่ได้อ่านค่านี้เลย (path รูปมาจาก session เท่านั้น) มันมีหน้าที่เดียวคือเป็น "กุญแจแคช"
 *   ถ้าทุกคนใช้ URL เดียวกัน เบราว์เซอร์จะหยิบรูปของคนก่อนหน้าจากแคชมาแสดงให้คนใหม่
 *   (แคชรูปแยกกันคนละชั้นกับ session — สลับผู้ใช้ถูกต้องแล้วแต่รูปยังเป็นของคนเก่า)
 */
export function Avatar({
  initial,
  hasPhoto,
  owner,
  className = "",
  size,
}: {
  initial: string;
  hasPhoto: boolean;
  owner: string;
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
      src={`${BASE}/api/me/photo?u=${encodeURIComponent(owner)}`}
      alt=""
      className={`avatar avatar-img ${className}`}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
