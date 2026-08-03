"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";
import { ssoProbe, ssoHandoffCode, ssoExitUrl, clearSsoCache } from "@/lib/sso";
import { isSigningOut } from "@/lib/auth/clientState";

/**
 * ===== ตัวเช็คว่า "คนที่ล็อกอินอยู่ตอนนี้ ยังเป็นเจ้าของ session ใบนี้ไหม" =====
 *
 * แก้บั๊ก: ล็อกอิน portal เป็นนาย A → เข้า arena ได้หน้าของ A → ออกจาก portal แล้วล็อกอินใหม่
 * เป็นนาย B → กลับมาที่ arena → **ยังเป็น A อยู่** แม้กด hard refresh
 *
 * สาเหตุคือ arena แลก SSO handoff แค่ครั้งแรกครั้งเดียวแล้วเชื่อคุกกี้ของตัวเองไปจนหมดอายุ
 * ไม่เคยถามซ้ำว่า "เบราว์เซอร์นี้ตอนนี้เป็นใคร" · แค่ลดอายุคุกกี้ไม่ช่วย — ระหว่างที่ยังไม่หมดอายุ
 * B ก็ยังเห็นข้อมูล/คะแนน/สิทธิ์ของ A อยู่ดี ต้องเช็คตัวตนสด ไม่ใช่รอหมดอายุ
 *
 * ⚠ กับดักที่ต้องรู้ก่อนแก้ไฟล์นี้
 * 1. "ถามไม่ได้" (เน็ต/CORS/Users ล่ม) ห้ามตีความว่า "ไม่มีใครล็อกอิน" → ต้องไม่ทำอะไรเลย
 *    ถ้าเหมารวมกัน เน็ตกระตุกทีเดียวจะเตะทั้งโรงเรียนออกพร้อมกัน — ความผิดพลาดที่แพงที่สุดของงานนี้
 * 2. ห้ามเทียบ session.code ของเราเองกับ sub ของ SchoolOS (คนละ namespace) ต้องเทียบ ssoSub
 *    ที่ประทับไว้ตอนแลก handoff เท่านั้น (ดู identity.ts)
 * 3. ห้ามใช้ router.push ตอนสลับคน — client navigation จะ re-render จาก cache ที่สร้างไว้ให้คนเก่า
 *    ต้อง window.location.assign() ให้ server เลือกหน้าปลายทางตามสิทธิ์ของคนใหม่
 * 4. ห้าม poll /api/auth/handoff (จำกัด 10 ครั้ง/นาที และเผาโค้ดทิ้งทุกครั้ง) ตัวที่ออกแบบมาให้
 *    ถามบ่อยคือ /api/auth/session ซึ่งอ่านจาก claims ล้วนและไม่ต่ออายุ idle window ของ SchoolOS
 * 5. ห้ามเอาไปใช้กับ session ที่ล็อกอินด้วยรหัสผ่าน (admin local) — ไม่มี session ฝั่งแพลตฟอร์ม
 *    ให้เทียบ จะถูกเตะออกจากระบบตัวเอง และวันที่ SchoolOS ล่มจะไม่เหลือทางเข้าสำรอง
 */

/** เช็คซ้ำทุกกี่มิลลิวินาทีระหว่างที่แท็บเปิดอยู่ */
const CHECK_EVERY_MS = 60_000;
/** ถี่สุดกี่มิลลิวินาทีต่อครั้ง — visibilitychange กับ focus ยิงพร้อมกันได้ ต้องกันรัว */
const MIN_GAP_MS = 10_000;

/**
 * กันลูป: การสลับคนจบด้วยการโหลดหน้าใหม่ ซึ่งจะ mount ตัวนี้อีกรอบ ถ้ายังไม่ตรงอีกจะ reload วนไม่จบ
 * เกิดจริงตอน deploy — token ที่ออกก่อนแพตช์นี้ยังไม่มี ssoSub เลยไม่มีวันเทียบผ่าน
 * (sessionStorage ไม่ใช่ localStorage: ผูกกับแท็บนี้เท่านั้น และหายเมื่อปิดแท็บ ซึ่งถูกแล้ว)
 */
const SWITCH_KEY = "arena.sso.switchedAt";
const SWITCH_COOLDOWN_MS = 30_000;

function switchedRecently(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(SWITCH_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SWITCH_COOLDOWN_MS;
  } catch {
    return false; // เบราว์เซอร์บางโหมดอ่านไม่ได้ — อย่างมากคือกันลูปไม่ได้ ไม่ใช่เหตุให้หน้าเว็บพัง
  }
}

function markSwitched(): void {
  try {
    window.sessionStorage.setItem(SWITCH_KEY, String(Date.now()));
  } catch {
    /* เขียนไม่ได้ก็ปล่อย */
  }
}

/**
 * @param sso session นี้มาจาก SSO ไหม (false = admin local → ไม่ทำอะไรเลย ดูกับดักข้อ 5)
 * @param ssoSub sub ฝั่ง SchoolOS ที่ประทับไว้ตอนแลก handoff · undefined = token รุ่นก่อนแพตช์
 *   ซึ่งจะถูกถือว่า "เทียบไม่ผ่าน" แล้วแลก handoff ใหม่หนึ่งครั้งเพื่อประทับค่าให้ (ตัวกันลูปคุมไว้แล้ว)
 */
export function SessionGuard({ sso = false, ssoSub }: { sso?: boolean; ssoSub?: string }) {
  // null = ปกติ · "switch" = กำลังสลับไปเป็นคนใหม่ · "leave" = กำลังพาออกจากระบบ
  const [overlay, setOverlay] = useState<null | "switch" | "leave">(null);
  const busyRef = useRef(false);
  const lastCheckRef = useRef(0);
  // ตัดสินใจพาออกไปแล้ว — หยุดเช็คทุกอย่าง ไม่งั้น interval จะยิงซ้อนระหว่างรอหน้าใหม่โหลด
  const leavingRef = useRef(false);
  // นัดเช็คที่ถูก throttle เลื่อนไว้ (ดู onWake) — null = ไม่มีนัดค้าง
  const retryRef = useRef<number | null>(null);

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  /**
   * จบ session ของเราแล้วพาออกไป
   * @param platformLogout ออกจากแพลตฟอร์มด้วยไหม
   *   true  = ไม่มีใครล็อกอิน SchoolOS แล้ว → ล้างคุกกี้ฝั่งโน้นให้เรียบร้อยแล้วไปจบที่หน้าแรก
   *           ตามนโยบายเดียวกับปุ่มออกจากระบบ/หมดเวลา (ดู ssoExitUrl)
   *   false = มีคนใหม่ล็อกอินอยู่แต่ไม่มีสิทธิ์ในระบบเรา — **ห้าม**แตะ session ของเขาเด็ดขาด
   *           แค่ล้างของเราแล้วไปหน้า login ของ arena
   */
  const leave = useCallback(
    async (platformLogout: boolean) => {
      await api.post("/api/auth/logout");
      clearSsoCache();
      const away = platformLogout ? await ssoExitUrl(true) : null;
      window.location.assign(away ?? `${base}/login`);
    },
    [base]
  );

  const check = useCallback(async () => {
    if (leavingRef.current || busyRef.current) return;
    // ผู้ใช้กดออกเองอยู่ — ปล่อยให้ทางนั้นทำงานจบ อย่าไปแย่งเปลี่ยนหน้า
    if (isSigningOut()) return;
    if (Date.now() - lastCheckRef.current < MIN_GAP_MS) return;
    lastCheckRef.current = Date.now();
    busyRef.current = true;
    try {
      // ⚠ force: ห้ามอ่านจากแคช นี่คือจุดเดียวที่จับได้ว่าคนที่หน้าเครื่องเปลี่ยนไปแล้ว
      const live = await ssoProbe({ force: true });

      // ถามไม่ได้ = ไม่รู้ ไม่ใช่ "ไม่มีใคร" → ไม่ทำอะไรเลย (กับดักข้อ 1)
      if (live.status === "unreachable") return;

      // คนเดิม — ปกติที่สุด จบตรงนี้
      if (live.status === "valid" && ssoSub && (live.user.sub === ssoSub || live.user.code === ssoSub)) {
        return;
      }

      // ===== ถึงตรงนี้ = ตัวตนไม่ตรงกับ session ที่ถืออยู่แล้ว =====
      leavingRef.current = true;

      // ไม่มีใครล็อกอิน SchoolOS แล้ว → session ของเราหมดความชอบธรรม
      if (live.status === "invalid") {
        setOverlay("leave");
        return void (await leave(true));
      }

      // หน้าที่ค้างอยู่เป็นของคนเก่า — คลุมทับกันกดโดนระหว่างรอเปลี่ยนหน้า
      setOverlay("switch");

      // เพิ่งสลับไปเมื่อกี้แล้วยังไม่ตรงอีก = วนแน่ ๆ → ตัดจบที่หน้า login ดีกว่า reload ไม่รู้จบ
      if (switchedRecently()) return void (await leave(false));
      markSwitched();

      // เป็นคนใหม่ที่ล็อกอินอยู่แล้ว → แลก handoff ใหม่เงียบ ๆ ไม่ต้องให้เขาพิมพ์อะไร
      const handoff = await ssoHandoffCode();
      if (handoff.status === "ok") {
        const res = await api.post<{ redirect: string }>("/api/auth/sso", { code: handoff.code });
        if (res.ok) {
          clearSsoCache();
          // ⚠ location.assign ไม่ใช่ router.push (กับดักข้อ 3)
          window.location.assign(`${base}${res.data.redirect || "/"}`);
          return;
        }
      }

      // คนใหม่ล็อกอิน SchoolOS ได้ แต่เข้าระบบเราไม่ได้ (ลาออก/จบแล้ว/ไม่อยู่ในทะเบียน)
      // — ที่แน่ ๆ คือปล่อยให้เขานั่งดูหน้าของคนเก่าต่อไม่ได้
      await leave(false);
    } finally {
      busyRef.current = false;
    }
  }, [ssoSub, leave, base]);

  useEffect(() => {
    if (!sso) return; // admin local — ไม่แตะ (กับดักข้อ 5)

    void check();

    /**
     * กลับมาที่แท็บนี้ — เคสหลักของบั๊ก (สลับคนในอีกแท็บแล้วคลิกกลับมา)
     *
     * ⚠ ถ้าติด throttle อยู่ ห้ามปล่อยเลยตามเลย ไม่งั้นต้องรอ interval รอบถัดไปซึ่งอาจอีกเกือบนาที
     * (เบราว์เซอร์หน่วง timer ของแท็บที่ซ่อนอยู่ด้วย) — ผู้ใช้จะนั่งดูหน้าของคนเก่าค้างอยู่นานเกินรับได้
     * จึงนัดไว้ให้เช็คทันทีที่พ้นช่วง throttle · focus กับ visibilitychange ยิงพร้อมกันได้
     * ตัวจับนัดซ้ำด้านล่างกันไม่ให้ตั้งซ้อน
     */
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      const since = Date.now() - lastCheckRef.current;
      if (since >= MIN_GAP_MS) return void check();
      if (retryRef.current != null) return;
      retryRef.current = window.setTimeout(() => {
        retryRef.current = null;
        void check();
      }, MIN_GAP_MS - since);
    };
    document.addEventListener("visibilitychange", onWake);
    // เช็คแค่ตอน mount ไม่พอ: เปิดแท็บนี้ค้างไว้แล้วไปเปลี่ยนคนที่ portal ในอีกแท็บ
    // แท็บนี้จะไม่รู้เรื่องเลยถ้าไม่มีสองตัวนี้ + interval
    window.addEventListener("focus", onWake);
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);

    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.clearInterval(timer);
      if (retryRef.current != null) window.clearTimeout(retryRef.current);
    };
  }, [sso, check]);

  if (!overlay) return null;
  return createPortal(
    <div className="modal-overlay" role="alert" aria-live="assertive">
      <div className="modal" style={{ maxWidth: 340 }}>
        <p className="modal-message text-center">
          {overlay === "switch" ? (
            <>
              บัญชีที่เข้าสู่ระบบ SchoolOS เปลี่ยนไป
              <br />
              กำลังสลับผู้ใช้ให้ตรงกัน…
            </>
          ) : (
            <>
              ออกจากระบบ SchoolOS แล้ว
              <br />
              กำลังพาออกจากระบบ…
            </>
          )}
        </p>
      </div>
    </div>,
    document.body
  );
}
