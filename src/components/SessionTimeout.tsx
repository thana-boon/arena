"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";
import { SSO_ENABLED, ssoProbe, ssoRefresh, ssoLogoutUrl, clearSsoCache } from "@/lib/sso";

/** เตือนก่อนหมดเวลากี่วินาที */
const WARN_SECONDS = 120;
/** ต่ออายุถี่สุดกี่วินาทีต่อครั้ง — กันยิง API รัวตามการขยับเมาส์ */
const RENEW_EVERY = 5 * 60;
/** Users ล่มตอน session แพลตฟอร์มหมดพอดี — เลื่อนไปถามใหม่อีกกี่วินาที (ไม่เตะผู้ใช้ออกเพราะเน็ตสะดุด) */
const SSO_RETRY_SECONDS = 60;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** เหตุผลที่หลุด — ส่งเป็น ?reason= ให้หน้า login อธิบายผู้ใช้ */
type EndReason = "timeout" | "expired" | "sso";

/**
 * ตัวคุมเวลาหมดอายุ session ฝั่งหน้าเว็บ
 *
 * ระบบนี้มี session สองชุดที่หมดอายุคนละที่:
 * 1) arena_session (JWT ของเรา) — บังคับจริงที่ exp ของ cookie ฝั่ง server (lib/auth/session.ts)
 * 2) sso_session ของ SchoolOS — บังคับที่ฝั่ง Users เราแตะไม่ได้ นอกจากเรียก refresh
 *
 * ⚠ กับดักที่ต้องรู้: การใช้งาน "ในระบบ arena" ไม่นับเป็น activity ของ SSO เลย และ
 * GET /api/auth/session ก็ไม่ต่ออายุให้ → ถ้าไม่ยิง POST /api/auth/refresh เอง ครูที่ทำงาน
 * ในระบบเรารวดเดียวจะหลุดจากแพลตฟอร์มกลางคันโดยไม่มีสัญญาณเตือนใด ๆ
 *
 * ตัวนี้จึงคุมทั้งสองชุดพร้อมกัน: นับถอยหลังจาก deadline ที่ "ถึงก่อน" แล้วต่ออายุทั้งคู่
 * เมื่อผู้ใช้ยังใช้งานอยู่จริง (มี activity + ใช้เวลาไปเกินครึ่งทางแล้ว) ไม่ใช่ยิงตามเวลาอัตโนมัติ
 * — setInterval ที่ยิงรัวโดยไม่ดู activity มีค่าเท่ากับปิด idle timeout ทิ้ง
 *
 * @param sso session นี้ผูกกับ SSO ไหม (admin local = false → ไม่แตะ Users เลยทั้งขาต่ออายุและขาออก)
 */
export function SessionTimeout({ idleSeconds, sso = false }: { idleSeconds: number; sso?: boolean }) {
  const useSso = sso && SSO_ENABLED;

  // เวลาที่ session จะหมดอายุ (ms epoch) — ตั้งใหม่ทุกครั้งที่ต่ออายุสำเร็จ
  const deadlineRef = useRef(Date.now() + idleSeconds * 1000);
  // deadline ของ session แพลตฟอร์ม (0 = ยังไม่รู้ / ไม่ได้ใช้ SSO)
  const ssoDeadlineRef = useRef(0);
  // ความยาวเต็มของหน้าต่าง idle ฝั่ง SSO — ใช้หา "ครึ่งทาง" (Users ไม่ได้บอกมาตรง ๆ ต้องอนุมานเอง)
  const ssoWindowRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const renewingRef = useRef(false);
  const endedRef = useRef(false);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);

  const endSession = useCallback(
    async (reason: EndReason) => {
      if (endedRef.current) return;
      endedRef.current = true;
      await api.post("/api/auth/logout");
      clearSsoCache();
      // ใช้ location แทน router เพื่อล้าง state ของหน้าทิ้งทั้งหมด
      // window.location ไม่ได้ถูกเติม basePath ให้อัตโนมัติเหมือน <Link> — ต้องเติมเอง
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const next = `/login?reason=${reason}`;
      // ออกจากระบบทั้งแพลตฟอร์ม ไม่งั้นคุกกี้ sso_session ยังอยู่แล้วหน้า login จะพากลับเข้าไปเอง
      window.location.href = useSso ? ssoLogoutUrl(next) : `${base}${next}`;
    },
    [useSso]
  );

  /** อ่าน deadline ของ SSO เข้ามาเก็บ + จำความยาวหน้าต่างไว้หาครึ่งทาง */
  const takeSsoDeadline = useCallback((expiresAt: number, fullWindow: boolean) => {
    ssoDeadlineRef.current = expiresAt;
    const span = expiresAt - Date.now();
    // จาก refresh = หน้าต่างเต็มใบแน่นอน / จาก probe = ใช้ไปบางส่วนแล้ว เก็บไว้เป็นค่าประมาณขั้นต่ำ
    if (span > 0 && (fullWindow || span > ssoWindowRef.current)) ssoWindowRef.current = span;
  }, []);

  const renew = useCallback(async () => {
    if (renewingRef.current || endedRef.current) return;
    renewingRef.current = true;
    try {
      const res = await api.post<{ expiresIn: number }>("/api/session");
      if (!res.ok) return void endSession("expired");
      deadlineRef.current = Date.now() + res.data.expiresIn * 1000;

      if (useSso) {
        const r = await ssoRefresh();
        if (r.status === "expired") return void endSession("sso");
        if (r.status === "ok") takeSsoDeadline(r.expiresAt, true);
        // unreachable = Users สะดุดชั่วคราว ไม่ใช่เหตุให้เตะผู้ใช้ออก ปล่อยให้รอบหน้าลองใหม่
      }
      setWarnLeft(null);
    } finally {
      renewingRef.current = false;
    }
  }, [endSession, takeSsoDeadline, useSso]);

  // ซิงก์เวลาที่เหลือจาก server จริง ๆ (ไม่ต่ออายุ) — ใช้ตอนกลับมาที่แท็บนี้ เผื่อแท็บอื่นต่ออายุไปแล้ว
  const sync = useCallback(async () => {
    if (endedRef.current) return;
    const res = await api.get<{ expiresIn: number }>("/api/session");
    if (!res.ok) return void endSession("timeout");
    deadlineRef.current = Date.now() + res.data.expiresIn * 1000;

    if (!useSso) return;
    // ⚠ force: ห้ามอ่านจากแคช ตรงนี้คือจุดเดียวที่จับได้ว่าผู้ใช้ไป logout จากบริการอื่นมา
    // (แคชจะยังตอบ valid ไปจนถึง expiresAt ซึ่งมองไม่เห็นการ logout เลย)
    // สำคัญกับเครื่องที่ใช้ร่วมกัน และยังปิดช่องที่ฝั่ง Users แจ้งไว้ว่าโค้ด handoff ที่ออกไปแล้ว
    // ยังแลกได้อีกไม่เกิน 60 วินาทีหลังผู้ใช้กด logout
    const probe = await ssoProbe({ force: true });
    if (probe.status === "invalid") return void endSession("sso");
    if (probe.status === "valid") takeSsoDeadline(probe.expiresAt, false);
  }, [endSession, takeSsoDeadline, useSso]);

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
      const now = Date.now();
      const left = Math.round((deadlineRef.current - now) / 1000);
      const ssoLeft = ssoDeadlineRef.current
        ? Math.round((ssoDeadlineRef.current - now) / 1000)
        : Infinity;

      if (left <= 0) return void endSession("timeout");

      if (ssoLeft <= 0) {
        // หมดเวลาฝั่งแพลตฟอร์มแล้ว — ยืนยันกับ Users ก่อนเตะออก เผื่อแท็บอื่นเพิ่งต่ออายุไป
        // และถ้ายิงไม่ถึงเพราะ Users ล่ม ห้ามเตะผู้ใช้ออกเด็ดขาด (session ของเรายังบังคับตัวเองอยู่)
        ssoDeadlineRef.current = now + SSO_RETRY_SECONDS * 1000;
        void ssoProbe({ force: true }).then((p) => {
          if (p.status === "invalid") void endSession("sso");
          else if (p.status === "valid") takeSsoDeadline(p.expiresAt, false);
        });
        return;
      }

      // นับถอยหลังจากอันที่ถึงก่อน — ไม่งั้นเตือนเรื่อง arena อยู่ดี ๆ แต่หลุดเพราะ SSO
      const effectiveLeft = Math.min(left, ssoLeft);

      if (effectiveLeft <= WARN_SECONDS) {
        // เข้าโซนเตือนแล้ว — ต้องกดยืนยัน "ใช้งานต่อ" เท่านั้น ไม่ต่อให้อัตโนมัติจากการขยับเมาส์
        setWarnLeft(effectiveLeft);
        return;
      }

      setWarnLeft(null);
      const idleFor = (now - lastActivityRef.current) / 1000;
      if (idleFor >= RENEW_EVERY) return; // ไม่ได้แตะอะไรเลย = ไม่ต่ออายุให้ ปล่อยให้ idle timeout ทำงาน

      // ยังใช้งานอยู่จริง → ต่อเมื่อ (ของเรา) ใช้ไปครบรอบต่ออายุ หรือ (ของ SSO) เลยครึ่งทางแล้ว
      const arenaDue = idleSeconds - left >= RENEW_EVERY;
      const ssoDue = ssoWindowRef.current > 0 && ssoLeft * 1000 <= ssoWindowRef.current / 2;
      if (arenaDue || ssoDue) void renew();
    }, 1000);

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, markActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [endSession, renew, sync, takeSsoDeadline, idleSeconds]);

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
