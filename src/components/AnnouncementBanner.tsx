"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import {
  DISMISS_COOKIE,
  parseDismissed,
  serializeDismissed,
  type AnnouncementView,
} from "@/lib/announcementTypes";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** จำว่ากดปิดแล้วไว้ใน cookie — เซิร์ฟเวอร์อ่านได้ตั้งแต่ render รอบหน้า จึงไม่แสดงซ้ำและไม่กระตุก */
function rememberDismissed(key: string) {
  const current = parseDismissed(
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${DISMISS_COOKIE}=`))
      ?.split("=")[1]
  );
  const value = serializeDismissed([...current.filter((k) => k !== key), key]);
  // ไม่ตั้ง Secure — prod บาง endpoint เสิร์ฟผ่าน HTTP ใน LAN (เหมือน cookie session)
  document.cookie = `${DISMISS_COOKIE}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

/**
 * แถบประกาศบนสุดของทุกหน้าหลังล็อกอิน (ประกอบใน AppShell)
 * ฝั่งเซิร์ฟเวอร์กรองอันที่เคยกดปิดออกไปแล้ว — ที่นี่เหลือแค่ "กดปิดรอบนี้"
 */
export function AnnouncementBanner({ items }: { items: AnnouncementView[] }) {
  const [hidden, setHidden] = useState<string[]>([]);

  function dismiss(a: AnnouncementView) {
    rememberDismissed(a.key);
    setHidden((p) => [...p, a.key]);
  }

  const visible = items.filter((a) => !hidden.includes(a.key));
  if (!visible.length) return null;

  return (
    <div className="ann-stack no-print">
      {visible.map((a) => (
        <div key={a.key} className={`ann ann-${a.level}`} role="status">
          <span className="ann-icon">
            <Icon name={a.level === "warning" ? "warning" : "pin"} size={18} />
          </span>
          <div className="ann-text">
            {a.title && <div className="ann-title">{a.title}</div>}
            <div className="ann-body">{a.body}</div>
          </div>
          {a.dismissible && (
            <button type="button" className="ann-close" onClick={() => dismiss(a)} aria-label="ปิดประกาศนี้">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
