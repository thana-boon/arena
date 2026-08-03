"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";

/** เตือนก่อนหมดเวลากี่วินาที */
const WARN_SECONDS = 120;
/** ต่ออายุถี่สุดกี่วินาทีต่อครั้ง — กันยิง API รัวตามการขยับเมาส์ */
const RENEW_EVERY = 5 * 60;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * ตัวคุมเวลาหมดอายุ session ฝั่งหน้าเว็บ
 *
 * ตัวจริงที่บังคับคือ exp ของ cookie ฝั่ง server (ดู lib/auth/session.ts) — ตัวนี้ทำหน้าที่
 * 1) ต่ออายุให้ "ระหว่างที่ยังใช้งานอยู่จริง" (ยิง POST /api/session เมื่อมีการขยับ อย่างมาก 5 นาที/ครั้ง)
 * 2) นับถอยหลังเตือนก่อนหลุด แล้วพากลับไปหน้า login เองเมื่อหมดเวลา
 *    (ไม่งั้นผู้ใช้จะเจอหน้าเว็บที่กดอะไรก็ error เพราะ session ตายไปแล้วแต่หน้ายังค้างอยู่)
 */
export function SessionTimeout({ idleSeconds }: { idleSeconds: number }) {
  // เวลาที่ session จะหมดอายุ (ms epoch) — ตั้งใหม่ทุกครั้งที่ต่ออายุสำเร็จ
  const deadlineRef = useRef(Date.now() + idleSeconds * 1000);
  const lastActivityRef = useRef(Date.now());
  const renewingRef = useRef(false);
  const endedRef = useRef(false);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);

  const endSession = useCallback(async (reason: "timeout" | "expired") => {
    if (endedRef.current) return;
    endedRef.current = true;
    await api.post("/api/auth/logout");
    // ใช้ location แทน router เพื่อล้าง state ของหน้าทิ้งทั้งหมด
    // window.location ไม่ได้ถูกเติม basePath ให้อัตโนมัติเหมือน <Link> — ต้องเติมเอง
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    window.location.href = `${base}/login?reason=${reason}`;
  }, []);

  const renew = useCallback(async () => {
    if (renewingRef.current || endedRef.current) return;
    renewingRef.current = true;
    const res = await api.post<{ expiresIn: number }>("/api/session");
    renewingRef.current = false;
    if (!res.ok) return endSession("expired");
    deadlineRef.current = Date.now() + res.data.expiresIn * 1000;
    setWarnLeft(null);
  }, [endSession]);

  // ซิงก์เวลาที่เหลือจาก server จริง ๆ (ไม่ต่ออายุ) — ใช้ตอนกลับมาที่แท็บนี้ เผื่อแท็บอื่นต่ออายุไปแล้ว
  const sync = useCallback(async () => {
    if (endedRef.current) return;
    const res = await api.get<{ expiresIn: number }>("/api/session");
    if (!res.ok) return endSession("timeout");
    deadlineRef.current = Date.now() + res.data.expiresIn * 1000;
  }, [endSession]);

  useEffect(() => {
    // เปิดหน้ามาอาจเป็น session ที่ปล่อยค้างไว้ครึ่งทางแล้ว — ถามเวลาที่เหลือจริงจาก server ก่อน
    void sync();

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, markActivity, { passive: true });
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        markActivity();
        sync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = window.setInterval(() => {
      if (endedRef.current) return;
      const left = Math.round((deadlineRef.current - Date.now()) / 1000);

      if (left <= 0) return void endSession("timeout");

      if (left <= WARN_SECONDS) {
        // เข้าโซนเตือนแล้ว — ต้องกดยืนยัน "ใช้งานต่อ" เท่านั้น ไม่ต่อให้อัตโนมัติจากการขยับเมาส์
        setWarnLeft(left);
        return;
      }

      setWarnLeft(null);
      // ยังใช้งานอยู่ + ใช้เวลาไปแล้วเกิน RENEW_EVERY นับจากรอบต่ออายุล่าสุด → ต่อให้
      const idleFor = (Date.now() - lastActivityRef.current) / 1000;
      const usedUp = idleSeconds - left;
      if (idleFor < RENEW_EVERY && usedUp >= RENEW_EVERY) void renew();
    }, 1000);

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, markActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [endSession, renew, sync, idleSeconds]);

  if (warnLeft == null) return null;
  return createPortal(
    <div className="modal-overlay" role="alertdialog" aria-modal="true" aria-labelledby="session-warn-title">
      <div className="modal" style={{ maxWidth: 380 }}>
        <h3 className="modal-title" id="session-warn-title">
          ใกล้ออกจากระบบอัตโนมัติ
        </h3>
        <p className="modal-message">
          ไม่พบการใช้งานสักพักแล้ว ระบบจะออกจากระบบให้อัตโนมัติใน{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>{mmss(warnLeft)}</b> นาที
          <br />
          <span className="muted text-sm">งานที่ยังไม่ได้กดบันทึกจะหายไป</span>
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => endSession("timeout")}>
            ออกจากระบบ
          </button>
          <button className="btn btn-primary" onClick={() => void renew()}>
            ใช้งานต่อ
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
