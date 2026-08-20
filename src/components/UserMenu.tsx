"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { LogoutButton } from "./LogoutButton";

/**
 * รูปโปรไฟล์บนแถบบน = ปุ่มเปิดเมนูผู้ใช้ (ชื่อ/บทบาท + ออกจากระบบ)
 * เดิมปุ่มออกจากระบบซ่อนอยู่บนมือถือ (ต้องเปิดแผ่นเมนูล่างก่อน) จนมีคนบ่นว่าหาไม่เจอ
 * — ตรงนี้คือที่ที่ทุกคนไปกดเป็นอันดับแรกอยู่แล้ว
 */
export function UserMenu({
  name,
  roleLabel,
  initial,
  hasPhoto,
  code,
  sso,
}: {
  name: string;
  roleLabel: string;
  initial: string;
  hasPhoto: boolean;
  code: string;
  sso: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // pointerdown ไม่ครอบ Safari เก่าบน iPad — ดักทั้งเมาส์และนิ้วไปเลย
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`user-menu${open ? " open" : ""}`} ref={boxRef}>
      <button
        type="button"
        className="um-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`บัญชีผู้ใช้ ${name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar initial={initial} hasPhoto={hasPhoto} owner={code} className="avatar-sm" />
        {/* จอแคบเหลือแค่รูป — ชื่อยาว ๆ กินที่แถบบนจนล้น */}
        <span className="nowrap hide-sm">{name}</span>
        <Icon name="chevron" size={16} className="um-caret" />
      </button>

      {open && (
        <div className="um-pop" role="menu">
          <div className="um-who">
            <span className="nm">{name}</span>
            <span className="rl">{roleLabel}</span>
          </div>
          <div className="um-sep" />
          <LogoutButton sso={sso} variant="menu" />
        </div>
      )}
    </div>
  );
}
