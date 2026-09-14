"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";
import { ssoProbe, ssoRefresh, ssoExitUrl, clearSsoCache, ssoConfig } from "@/lib/sso";
import { markKickedOut, isSigningOut } from "@/lib/auth/clientState";

/** เตือนก่อนหมดเวลากี่วินาที */
const WARN_SECONDS = 120;
/** ต่ออายุถี่สุดกี่วินาทีต่อครั้ง — กันยิง API รัวตามการใช้งาน */
const RENEW_EVERY = 5 * 60;
/**
 * ต่ออายุ session ของ Users เมื่อ "เส้นตายของมันเอง" เหลือน้อยกว่านี้ — ไม่ใช่ตามนาฬิกาของเรา
 *
 * cadence เดิม ("ทุก 10 นาที") นับจากตอน component mount ซึ่งไม่มีความสัมพันธ์อะไรเลยกับ
 * นาฬิกาที่ฆ่า session จริง ๆ: มาถึงด้วย handoff ไม่ได้แปลว่าเพิ่งเริ่มนับ 15 นาที
 * (ทั้ง handoff และ GET /api/auth/session จงใจไม่เลื่อน idle window) session จึงอาจ
 * เหลืออีกสองนาทีตอนหน้าเราโหลดเสร็จ แล้วการต่ออายุครั้งแรกไปตกเอาตอนมันตายไปแล้ว
 * แย่กว่านั้น ทุกการโหลดหน้าใหม่ = mount ใหม่ = เริ่มนับ 10 นาทีใหม่ คนที่คลิกไปมาทุก ๆ
 * 9 นาทีจึงไม่เคยต่ออายุ session แพลตฟอร์มเลยสักครั้ง แล้วถูกเด้งออกคามือที่นาทีที่ 15
 *
 * หนึ่งในสามของหน้าต่าง 15 นาที เหลือที่ให้ retry อีกสองรอบก่อนจะเสียอะไรไป และยังคงถามเฉพาะ
 * ตอนที่มีคนอยู่จริงเหมือนเดิม
 */
const SSO_RENEW_UNDER = 5 * 60;
/**
 * ถ้าอ่านเส้นตายฝั่งแพลตฟอร์มไม่ได้เลย (probe ยิงไม่ถึง) ค่อยตกลงมาใช้ cadence คงที่
 * และต้องสั้นกว่าหน้าต่างจริงอย่างชัดเจน เพราะตอนที่มองไม่เห็นคือตอนที่ไม่มีโอกาสแก้ตัว
 */
const SSO_BLIND_GAP = 5 * 60;
/** Users ล่มตอน session แพลตฟอร์มหมดพอดี — เลื่อนไปถามใหม่อีกกี่วินาที (ไม่เตะผู้ใช้เพราะเน็ตสะดุด) */
const SSO_RETRY_SECONDS = 60;

/**
 * นับเฉพาะ "การขยับจริง"
 * ⚠ ห้ามใส่ mousemove เด็ดขาด — เมาส์สะเทือนบนโต๊ะก็ต่ออายุ session ได้ เท่ากับไม่มี idle timeout
 */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/** เหตุผลที่หลุด — ส่งเป็น ?reason= ให้หน้า login อธิบายผู้ใช้ (ใช้เฉพาะ session ที่ไม่ได้ผูก SSO) */
type EndReason = "timeout" | "expired" | "sso";

/**
 * ตัวคุมเวลาหมดอายุ session ฝั่งหน้าเว็บ
 *
 * ระบบนี้มี session สองชุดที่หมดอายุคนละที่:
 * 1) arena_session (JWT ของเรา) — บังคับจริงที่ exp ของ cookie ฝั่ง server (lib/auth/session.ts)
 * 2) session ของ SchoolOS — บังคับที่ฝั่ง Users เราแตะไม่ได้ นอกจากเรียก refresh
 *
 * ⚠ กับดักที่ต้องรู้: Users ไม่นับการใช้งาน "ในระบบ arena" เป็น activity เลย (จงใจ) และ
 * GET /api/auth/session ก็ไม่ต่ออายุให้ → ถ้าไม่ยิง refresh เอง ครูที่ทำงานในระบบเรารวดเดียว
 * จะหลุดจากแพลตฟอร์มกลางคันโดยไม่มีสัญญาณเตือนใด ๆ
 *
 * ตัวนี้จึงคุมทั้งสองชุดพร้อมกัน: นับถอยหลังจาก deadline ที่ "ถึงก่อน" แล้วต่ออายุทั้งคู่
 * เมื่อผู้ใช้ยังใช้งานอยู่จริงเท่านั้น — setInterval ที่ยิงรัวโดยไม่ดู activity มีค่าเท่ากับ
 * ปิด idle timeout ทิ้ง เพราะแท็บที่เปิดค้างไว้จะต่ออายุตัวเองไปเรื่อย ๆ
 *
 * @param sso session นี้ผูกกับ SSO ไหม (admin local = false → ไม่แตะ Users เลยทั้งขาต่ออายุและขาออก)
 */
export function SessionTimeout({
  idleSeconds,
  sso = false,
  client,
}: {
  idleSeconds: number;
  sso?: boolean;
  /**
   * ชุดหน้าต่างเวลาที่ session นี้อยู่ — ใช้ตัดสิน "ปลายทางตอนหมดเวลา" อย่างเดียว
   * ความยาวนาฬิกาเป็นเรื่องของ server (idleSeconds มาจากที่นั่นแล้ว)
   */
  client?: "web" | "pwa";
}) {
  // เวลาที่ session จะหมดอายุ (ms epoch) — ตั้งใหม่ทุกครั้งที่ต่ออายุสำเร็จ
  const deadlineRef = useRef(Date.now() + idleSeconds * 1000);
  // deadline ของ session แพลตฟอร์ม (0 = ยังไม่รู้ / ไม่ได้ใช้ SSO)
  const ssoDeadlineRef = useRef(0);
  // ต่ออายุฝั่ง SSO ครั้งล่าสุดเมื่อไหร่ — ใช้เป็นพื้นของทางที่ "มองไม่เห็นเส้นตาย" เท่านั้น
  // และจงใจเริ่มที่ 0 ไม่ใช่ Date.now(): หน้าที่เพิ่งโหลดไม่รู้อะไรเลยเกี่ยวกับนาฬิกาของแพลตฟอร์ม
  // การเริ่มที่ "ตอนนี้" คือการเดาว่า "ต้องเหลือเต็มหน้าต่างแน่ ๆ" ซึ่งเป็นต้นเหตุของการเด้งหลุด
  // คามือพอดี — 0 แปลว่า "ถามตั้งแต่ tick แรกที่เห็นว่ามีคนอยู่" ซึ่งเป็นคำตอบที่ซื่อตรงกว่า
  const ssoRenewedRef = useRef(0);
  // ครั้งล่าสุดที่ "พยายาม" ต่ออายุฝั่ง SSO (สำเร็จหรือไม่ก็ตาม) — tick ของตัวนี้เดินทุกวินาที
  // ถ้าไม่มีพื้นตรงนี้ Users ที่กำลังสะดุดจะโดนยิงซ้ำวินาทีละครั้งตลอดเวลาที่มันยังตอบไม่ได้
  const ssoTriedRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const renewingRef = useRef(false);
  const endedRef = useRef(false);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);

  /**
   * จบ session แล้วพาผู้ใช้ออกไป
   *
   * ปลายทางคือหน้าแรกของ SchoolOS เสมอตามนโยบาย (ไม่ค้างอยู่หน้า login ของเรา) —
   * ตกมาที่ `/login?reason=` เฉพาะตอน SSO ปิดอยู่หรืออ่าน config ไม่ได้เท่านั้น
   *
   * ⚠ session ที่ผูก SSO ต้องออกจากแพลตฟอร์มด้วยเสมอ ไม่งั้นคุกกี้ของ Users ยังอยู่
   * แล้วหน้า login จะ SSO กลับเข้ามาเอง = timeout ไม่มีผลจริง
   */
  const endSession = useCallback(
    async (reason: EndReason, manual = false) => {
      if (endedRef.current) return;
      // ผู้ใช้กดออกเอง — 401 ที่ตามมาจาก request ที่ค้างอยู่ในท่อไม่ใช่ "เซสชันหมดอายุ"
      // ถ้าไม่กันตรงนี้ หน้า login จะขึ้นข้อความผิดบริบท แถม SSO โดนบล็อกต่ออีกช่วงหนึ่ง
      if (isSigningOut()) return;
      endedRef.current = true;
      // ⚠ ธงนี้มีไว้กัน SSO ดึงกลับทันทีหลังโดน "เตะ" เท่านั้น
      // ผู้ใช้กดออกเอง หรือ SSO ฝั่งโน้นดับไปแล้ว ห้ามตั้ง ไม่งั้นเขาล็อกอิน SchoolOS ใหม่แล้ว
      // กลับมาที่ arena จะเข้าเองไม่ได้อีกทั้งช่วง idle ทั้งที่ควรเข้าได้ทันที
      if (!manual && reason !== "sso") markKickedOut();
      await api.post("/api/auth/logout");
      clearSsoCache();

      /**
       * แอปที่ติดตั้งไม่ได้ออกทางเดียวกับแท็บบนเครื่องส่วนกลาง
       *
       * บนเครื่องส่วนกลาง การหมดเวลาต้องพาออกจากแพลตฟอร์มด้วย ไม่งั้นคนถัดไปที่เปิดเครื่อง
       * ได้ session ของคนเดิม และ silent SSO จะพากลับเข้ามาเอง = timeout ไม่มีผลจริง
       *
       * บนมือถือของเจ้าตัวมันตรงกันข้าม: เครื่องมีล็อกหน้าจอของตัวเอง ไม่มีคนถัดไป และ session
       * ฝั่งแพลตฟอร์มของเขาวัดกันเป็นสัปดาห์ การลากเขาออกจาก SchoolOS ทั้งระบบเพราะแอปนี้
       * ถูกวางทิ้งไว้ คือการทำลาย session ของทุกแอปอื่นบนเครื่องนั้นไปด้วย · ให้ไป /login ของเรา
       * แล้วปล่อย silent SSO พากลับเข้าหน้าที่เขาอยู่เงียบ ๆ (กับดัก 4.21)
       */
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      if (client === "pwa") {
        window.location.assign(`${base}/login`);
        return;
      }

      const away = await ssoExitUrl(sso);
      // ใช้ location แทน router เพื่อล้าง state ของหน้าทิ้งทั้งหมด
      // window.location ไม่ได้ถูกเติม basePath ให้อัตโนมัติเหมือน <Link> — ต้องเติมเอง
      window.location.assign(away ?? `${base}/login?reason=${reason}`);
    },
    [sso, client]
  );

  const takeSsoDeadline = useCallback((expiresAt: number) => {
    ssoDeadlineRef.current = expiresAt;
  }, []);

  const renew = useCallback(async () => {
    if (renewingRef.current || endedRef.current) return;
    renewingRef.current = true;
    try {
      const res = await api.post<{ expiresIn: number }>("/api/session");
      // ต่อไม่ได้ = ชนเพดานสัมบูรณ์ หรือ token ตายไปแล้ว (ห้ามชุบชีวิต session ที่ตายแล้ว)
      if (!res.ok) return void endSession("expired");
      deadlineRef.current = Date.now() + res.data.expiresIn * 1000;

      if (sso) {
        const r = await ssoRefresh();
        if (r.status === "expired") return void endSession("sso");
        if (r.status === "ok") {
          takeSsoDeadline(r.expiresAt);
          ssoRenewedRef.current = Date.now();
        }
        // unreachable = Users สะดุดชั่วคราว ไม่ใช่เหตุให้เตะผู้ใช้ออก ปล่อยให้รอบหน้าลองใหม่
      }
      setWarnLeft(null);
    } finally {
      renewingRef.current = false;
    }
  }, [endSession, takeSsoDeadline, sso]);

  // ซิงก์เวลาที่เหลือจาก server จริง ๆ (ไม่ต่ออายุ) — ใช้ตอนกลับมาที่แท็บนี้ เผื่อแท็บอื่นต่ออายุไปแล้ว
  const sync = useCallback(async () => {
    if (endedRef.current) return;
    const res = await api.get<{ expiresIn: number }>("/api/session");
    if (!res.ok) return void endSession("timeout");
    deadlineRef.current = Date.now() + res.data.expiresIn * 1000;

    if (!sso) return;
    // ⚠ force: ห้ามอ่านจากแคช ตรงนี้คือจุดเดียวที่จับได้ว่าผู้ใช้ไป logout จากบริการอื่นมา
    // (แคชจะยังตอบ valid ไปจนถึง expiresAt ซึ่งมองไม่เห็นการ logout เลย) — สำคัญกับเครื่องส่วนกลาง
    const probe = await ssoProbe({ force: true });
    if (probe.status === "invalid") return void endSession("sso");
    if (probe.status === "valid") takeSsoDeadline(probe.expiresAt);
  }, [endSession, takeSsoDeadline, sso]);

  useEffect(() => {
    // เปิดหน้ามาอาจเป็น session ที่ปล่อยค้างไว้ครึ่งทางแล้ว — ถามเวลาที่เหลือจริงจาก server ก่อน
    void sync();
    // อุ่นค่า config ไว้ล่วงหน้า เพื่อให้ตอนต้องเด้งออกจริงไม่ต้องรอ request นี้ก่อน
    // (ทุก session ต้องใช้ ไม่ใช่เฉพาะที่ผูก SSO — ทางที่ไม่ผูกก็ต้องรู้ที่อยู่ portal)
    void ssoConfig();

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, markActivity, { passive: true });
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        markActivity();
        void sync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = window.setInterval(() => {
      if (endedRef.current) return;
      const now = Date.now();
      const left = Math.round((deadlineRef.current - now) / 1000);
      const ssoLeft = ssoDeadlineRef.current ? Math.round((ssoDeadlineRef.current - now) / 1000) : Infinity;

      if (left <= 0) return void endSession("timeout");

      if (ssoLeft <= 0) {
        // หมดเวลาฝั่งแพลตฟอร์มแล้ว — ยืนยันกับ Users ก่อนเตะออก เผื่อแท็บอื่นเพิ่งต่ออายุไป
        // และถ้ายิงไม่ถึงเพราะ Users ล่ม ห้ามเตะผู้ใช้ออกเด็ดขาด (session ของเรายังบังคับตัวเองอยู่)
        ssoDeadlineRef.current = now + SSO_RETRY_SECONDS * 1000;
        void ssoProbe({ force: true }).then((p) => {
          if (p.status === "invalid") void endSession("sso");
          else if (p.status === "valid") takeSsoDeadline(p.expiresAt);
        });
        return;
      }

      // นับถอยหลังจากอันที่ถึงก่อน — ไม่งั้นเตือนเรื่อง arena อยู่ดี ๆ แต่หลุดเพราะ SSO
      const effectiveLeft = Math.min(left, ssoLeft);

      if (effectiveLeft <= WARN_SECONDS) {
        // เข้าโซนเตือนแล้ว — ต้องกดยืนยัน "ใช้งานต่อ" เท่านั้น ไม่ต่อให้อัตโนมัติจากการขยับ
        setWarnLeft(effectiveLeft);
        return;
      }

      setWarnLeft(null);

      // ⚠ เงื่อนไขบังคับของทั้งสองขา: ต้องมี "การขยับจริง" ภายใน RENEW_EVERY ที่ผ่านมา
      // ดูแค่ "ใกล้หมดอายุ" ไม่ได้ ไม่งั้นแท็บที่เปิดค้างไว้เฉย ๆ จะต่ออายุตัวเองไปเรื่อย ๆ
      const idleFor = (now - lastActivityRef.current) / 1000;
      if (idleFor >= RENEW_EVERY) return;

      const arenaDue = idleSeconds - left >= RENEW_EVERY;
      // เส้นตายของ Users เอง ซึ่ง sync()/probe เก็บมาให้แล้ว — ต่อเมื่อ "เหลือน้อย" ไม่ใช่เมื่อ
      // "ครบรอบของเรา" ค่านี้รอดจากการโหลดหน้าใหม่ ต่างจากตัวนับที่รีเซ็ตทุก mount
      // ssoLeft เป็น Infinity เมื่อยังไม่รู้เส้นตาย (probe ยิงไม่ถึง) จึงต้องมีทางสำรองไว้ด้วย
      const ssoDue =
        sso &&
        (now - ssoTriedRef.current) / 1000 >= SSO_RETRY_SECONDS &&
        (ssoDeadlineRef.current === 0
          ? (now - ssoRenewedRef.current) / 1000 >= SSO_BLIND_GAP
          : ssoLeft <= SSO_RENEW_UNDER);
      if (arenaDue || ssoDue) {
        // จดว่า "ลองแล้ว" ก่อนยิง ไม่ใช่หลังสำเร็จ — สองค่านี้คนละหน้าที่กัน: ssoTriedRef คุมความถี่
        // ของการลอง ส่วน ssoRenewedRef เลื่อนเฉพาะตอนสำเร็จ (ดูใน renew) เพราะครั้งที่ล้มเหลว
        // ต้องได้ลองใหม่ตอนที่ยังมีเวลาเหลือ ไม่ใช่เสียทั้งช่วงไปเพราะเน็ตกระตุกทีเดียว
        if (ssoDue) ssoTriedRef.current = now;
        void renew();
      }
    }, 1000);

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, markActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [endSession, renew, sync, takeSsoDeadline, idleSeconds, sso]);

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
          <button className="btn btn-ghost" onClick={() => endSession("timeout", true)}>
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
