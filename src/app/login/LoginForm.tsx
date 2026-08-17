"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { ssoConfig, ssoHandoffCode, ssoPortalUrl } from "@/lib/sso";
import {
  clearKickedOut,
  kickedRecently,
  bouncedRecently,
  markPortalBounce,
  clearPortalBounce,
} from "@/lib/auth/clientState";

/**
 * ===== ประตูเข้าระบบมีบานเดียว: SchoolOS =====
 *
 * นโยบาย: ไม่มี session ของ arena = ต้องไปโผล่หน้าแรกของ SchoolOS ไม่ใช่ฟอร์มรหัสผ่านของเรา
 * (คู่กับขาออกใน SessionTimeout/LogoutButton/SessionGuard ที่พาไป portal อยู่แล้ว — ก่อนหน้านี้
 * ขาเข้าไม่ตรงกับขาออก: ออกไป SchoolOS แต่พอกลับเข้ามาเจอฟอร์มของ arena ให้กรอกซ้ำ)
 *
 * หน้านี้จึงเป็น "ทางผ่าน" ไม่ใช่หน้าฟอร์ม: เปิดมาแล้วลอง silent SSO หนึ่งครั้ง ผ่านก็เข้าระบบเลย
 * ไม่ผ่านก็เด้งไป portal
 *
 * ⚠ ห้ามเด้งไป portal ตั้งแต่ middleware/server โดยไม่ลอง SSO ก่อนเด็ดขาด — ครูที่ล็อกอิน
 * SchoolOS ค้างไว้แล้ว (เคสปกติที่สุด) จะถูกเตะออกไป portal ทั้งที่ควรเข้าได้เงียบ ๆ แล้วพอกด
 * ไอคอน arena ที่ portal ก็โดนเตะกลับอีก = วนไม่จบ · จุดที่รู้ว่า "เบราว์เซอร์นี้มี session
 * ของแพลตฟอร์มไหม" มีที่เดียวคือฝั่งเบราว์เซอร์ (คุกกี้ของ Users เป็น httpOnly คนละ origin)
 *
 * ฟอร์มรหัสผ่านยังอยู่ แต่เป็นทางออกฉุกเฉินเท่านั้น เปิดให้เห็นแค่ 3 กรณี:
 *   1. SSO ปิดอยู่ (ไม่ได้ตั้ง SSO_USERS_BASE)
 *   2. ยิงไปหา Users ไม่ถึง/ไม่ตอบ — วันที่ SchoolOS ล่ม ถ้าเด้งไป portal คือส่งผู้ใช้ไปหน้าตาย
 *      และ admin local จะไม่เหลือทางเข้ามาแก้อะไรเลย
 *   3. เปิดหน้านี้ด้วย ?local=1 — ทางเข้าที่ admin local ใช้ได้เสมอโดยไม่ต้องรอให้ระบบพัง
 */

/**
 * เว้นระยะระหว่างการลอง SSO ซ้ำ — Users จำกัดการขอโค้ดไว้ 10 ครั้ง/นาที/session
 * สลับแท็บไปมาเร็ว ๆ ต้องไม่กินโควตานั้นจนหมด
 */
const RETRY_GAP_MS = 15_000;

/**
 * สิ่งที่หน้านี้กำลังแสดง
 * - checking : กำลังลอง SSO (ห้ามโชว์อะไรที่กดได้ ไม่งั้นผู้ใช้กดแล้วโดนเปลี่ยนหน้าใส่)
 * - leaving  : กำลังเด้งไป portal
 * - manual   : ต้องไป SchoolOS เหมือนกัน แต่ให้ผู้ใช้กดเอง (กันลูป ดู bouncedRecently)
 * - form     : ฟอร์มรหัสผ่าน (ทางออกฉุกเฉิน 3 กรณีข้างบน)
 */
type View = "checking" | "leaving" | "manual" | "form";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get("next");
  // เด้งมาจากการหมดเวลาใช้งาน (ดู SessionTimeout.tsx) — บอกเหตุผล ไม่งั้นดูเหมือนระบบเตะออกเฉย ๆ
  const reason = params.get("reason");
  // ทางเข้าของ admin local — ข้าม SSO ทั้งหมดแล้วโชว์ฟอร์มเลย
  const local = params.get("local") === "1";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");

  // ⚠ เริ่มต้นที่ checking เสมอ: ระหว่างเช็คห้ามโชว์อะไรทั้งนั้น ไม่งั้นคนที่ล็อกอิน SchoolOS
  // อยู่แล้วจะเห็นหน้าจอกระพริบก่อนถูกพาเข้าระบบ ซึ่งดูเหมือนระบบรวน
  const [view, setView] = useState<View>("checking");
  // ข้อความบนหน้าจอ manual — บอกให้ตรงเหตุ ไม่งั้นผู้ใช้ไม่รู้ว่าต้องทำอะไรต่อ
  const [notice, setNotice] = useState("");
  const [portal, setPortal] = useState<string | null>(null);

  const attemptingRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const succeededRef = useRef(false);
  // ผู้ใช้เริ่มพิมพ์ในฟอร์มแล้วหรือยัง — พิมพ์แล้วห้าม SSO แย่งพาเข้าระบบเด็ดขาด
  // เขาตั้งใจใช้บัญชีที่กำลังกรอกอยู่ (เช่นครูยืมเครื่องให้นักเรียนล็อกอิน)
  const typedRef = useRef(false);

  /** ไป SchoolOS — ทางเดียวที่ผู้ใช้ทั่วไปจะได้ session ใหม่ */
  const goPortal = useCallback(async (): Promise<boolean> => {
    const url = await ssoPortalUrl();
    if (!url) return false; // SSO ปิดอยู่ — ผู้เรียกต้องตกไปที่ฟอร์ม
    markPortalBounce();
    setView("leaving");
    // ⚠ location.assign ไม่ใช่ router.push — คนละแอปคนละ origin
    window.location.assign(url);
    return true;
  }, []);

  /** หยุดที่หน้าจอ "กดไปเอง" พร้อมเตรียมลิงก์ portal ไว้ให้กด */
  const stopAndAsk = useCallback(async (message: string) => {
    setNotice(message);
    setPortal(await ssoPortalUrl());
    setView("manual");
  }, []);

  /**
   * เข้าระบบด้วย session ของแพลตฟอร์ม: ขอโค้ดใช้ครั้งเดียวจาก Users แล้วให้ server เราแลกเอง
   * คืน true เมื่อกำลังพาเข้าระบบแล้ว
   *
   * ⚠ ห้าม retry ด้วยโค้ดเดิมเด็ดขาด (โค้ดถูกใช้ไปแล้วไม่ว่าผลจะออกมาเป็นอะไร) ต้องขอใหม่เสมอ
   *
   * @param byUser ผู้ใช้กดปุ่มเอง (ไม่ใช่รอบอัตโนมัติตอนเปิดหน้า) — ข้ามตัวกันลูปได้
   *   เพราะการวนที่ต้องกดเองทุกรอบไม่ใช่ลูป และการขัดคนที่กดปุ่มไว้เองน่ารำคาญกว่า
   */
  const attempt = useCallback(async (byUser = false): Promise<boolean> => {
    if (attemptingRef.current || succeededRef.current) return false;
    attemptingRef.current = true;
    lastAttemptRef.current = Date.now();
    try {
      const handoff = await ssoHandoffCode();

      // ยิงไม่ถึง Users / ไม่ตอบในเวลา → ห้ามเด้งไป portal (ที่นั่นก็ล่มอยู่)
      // เปิดฟอร์มไว้ให้ admin local เข้ามาจัดการได้
      if (handoff.status === "unreachable") {
        setNotice("ตอนนี้ติดต่อระบบเข้าสู่ระบบกลางของ SchoolOS ไม่ได้ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน");
        setView("form");
        return false;
      }

      // ยังไม่ได้ล็อกอินกับแพลตฟอร์ม (หรือขอโค้ดไม่ผ่าน) → ไปเข้าสู่ระบบที่ SchoolOS
      if (handoff.status !== "ok") {
        if (!byUser && bouncedRecently()) {
          await stopAndAsk("ยังไม่ได้เข้าสู่ระบบ SchoolOS — กรุณาเข้าสู่ระบบที่ SchoolOS แล้วกดปุ่มด้านล่าง");
          return false;
        }
        if (!(await goPortal())) setView("form"); // SSO ปิด — ตกไปที่ฟอร์ม
        return false;
      }

      const res = await api.post<{ redirect: string }>("/api/auth/sso", { code: handoff.code });
      if (!res.ok) {
        // ล็อกอิน SchoolOS อยู่แล้วแต่เข้า arena ไม่ได้ (ไม่อยู่ในทะเบียน/พ้นสภาพ/ระบบเราขัดข้อง)
        // ⚠ ห้ามเด้งไป portal เคสนี้เด็ดขาด — portal เห็นว่ายังล็อกอินอยู่ก็ส่งกลับมาที่นี่ = วนไม่จบ
        await stopAndAsk(res.error);
        return false;
      }

      succeededRef.current = true;
      clearKickedOut();
      clearPortalBounce();
      router.push(nextUrl || res.data.redirect);
      router.refresh();
      return true;
    } finally {
      attemptingRef.current = false;
    }
  }, [nextUrl, router, goPortal, stopAndAsk]);

  // ===== เปิดหน้ามา: ตัดสินใจครั้งเดียวว่าจะไปทางไหน =====
  useEffect(() => {
    let alive = true;
    void (async () => {
      const cfg = await ssoConfig();
      if (!alive) return;

      // SSO ปิดอยู่ / ทางเข้าฉุกเฉินของ admin local — ฟอร์มรหัสผ่านตามเดิม
      if (!cfg.enabled || local) return setView("form");

      // เพิ่งถูกเตะออกเพราะไม่มีการใช้งาน — ห้าม SSO ดึงกลับ "เอง" ไม่งั้น idle timeout ไร้ความหมาย
      // (ธงนี้หมดอายุเองใน 1 ช่วง idle ดู clientState.ts)
      // ⚠ ห้ามเด้งไป portal อัตโนมัติในเคสนี้ด้วย: ถ้า session ฝั่ง SchoolOS ยังอยู่ portal จะส่งกลับ
      // มาที่นี่ทันที แล้วโดนธงนี้บล็อกอีก = เด้งไป-กลับจนครบช่วง idle · หยุดให้กดปุ่มเอง
      // ซึ่งเป็นการ "ตั้งใจเข้าใหม่" พอดี — timeout จึงยังมีผลจริง แต่ผู้ใช้ไม่ติดอยู่ในลูป
      if (kickedRecently(cfg.idleSeconds)) {
        return void stopAndAsk(
          reason === "expired"
            ? "หมดเวลาใช้งานสูงสุดของรอบนี้ กรุณาเข้าสู่ระบบใหม่"
            : "ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเป็นเวลานาน"
        );
      }

      await attempt();
    })();
    return () => {
      alive = false;
    };
  }, [attempt, stopAndAsk, local, reason]);

  /**
   * ปุ่ม "เข้าสู่ระบบอีกครั้ง" บนหน้าจอ manual — ทางออกเดียวที่ไม่วน
   *
   * ล้างธง "เพิ่งถูกเตะออก" เพราะการกดปุ่มนี้คือเจตนาเข้าใหม่ของผู้ใช้เอง (ไม่ใช่ SSO ลากกลับ)
   * แล้วลองใหม่ทั้งชุด: ล็อกอิน SchoolOS อยู่แล้วก็เข้าเลย · ยังไม่ได้ล็อกอินก็พาไป portal
   */
  const retryNow = useCallback(async () => {
    if (attemptingRef.current || succeededRef.current) return;
    clearKickedOut();
    setView("checking"); // ทางล้มเหลวทุกทางของ attempt ตั้ง view ให้เองแล้ว จึงไม่มีทางค้างที่นี่
    await attempt(true);
  }, [attempt]);

  // ===== กลับมาที่แท็บนี้: ลองใหม่ =====
  /**
   * ⚠ จำเป็นเพราะผู้ใช้ไปล็อกอิน SchoolOS ในอีกแท็บแล้วคลิกกลับมาแท็บนี้ที่ยัง mount ค้างอยู่
   * ถ้าลองแค่ตอน mount ครั้งเดียว จะไม่มีอะไรลองใหม่ให้เลย ผู้ใช้ต้องกด F5 เอง
   *
   * ⚠ รอบนี้ล้มเหลว "ห้ามเด้ง" ไป portal เอง — ผู้ใช้กำลังมองหน้านี้อยู่ การเปลี่ยนหน้าใส่โดยที่
   * เขาไม่ได้กดอะไรคือการแย่งเมาส์ · ปล่อยให้เขากดปุ่มบนหน้าจอ manual เอง
   */
  useEffect(() => {
    const retry = () => {
      if (document.visibilityState !== "visible") return;
      if (succeededRef.current || attemptingRef.current || typedRef.current) return;
      if (Date.now() - lastAttemptRef.current < RETRY_GAP_MS) return;
      void (async () => {
        const cfg = await ssoConfig();
        if (!cfg.enabled || kickedRecently(cfg.idleSeconds)) return;
        if (succeededRef.current || attemptingRef.current || typedRef.current) return;
        const handoff = await ssoHandoffCode();
        lastAttemptRef.current = Date.now();
        if (handoff.status !== "ok") return; // ยังไม่ได้ล็อกอิน — อยู่หน้าเดิมเงียบ ๆ
        const res = await api.post<{ redirect: string }>("/api/auth/sso", { code: handoff.code });
        if (!res.ok) return;
        succeededRef.current = true;
        clearKickedOut();
        clearPortalBounce();
        router.push(nextUrl || res.data.redirect);
        router.refresh();
      })();
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("focus", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("focus", retry);
    };
  }, [nextUrl, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // ฟอร์มเดียว: ส่ง identifier + secret แล้วให้ server ตรวจเองว่าเป็น admin / ครู / นักเรียน
    const res = await api.post<{ redirect: string }>("/api/auth/login", {
      identifier: identifier.trim(),
      secret,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    clearKickedOut();
    clearPortalBounce();
    router.push(nextUrl || res.data.redirect);
    router.refresh();
  }

  if (view === "checking" || view === "leaving") {
    return (
      <div className="text-center" style={{ padding: "24px 0" }}>
        <div className="muted">
          {view === "leaving" ? "กำลังไปหน้าเข้าสู่ระบบของ SchoolOS…" : "กำลังตรวจสอบการเข้าสู่ระบบ…"}
        </div>
      </div>
    );
  }

  if (view === "manual") {
    return (
      <div className="text-center">
        <div className="alert alert-warning" style={{ textAlign: "left" }}>
          {notice}
        </div>
        <p className="muted text-sm">ระบบนี้เข้าสู่ระบบด้วยบัญชี SchoolOS เท่านั้น</p>
        <button className="btn btn-primary btn-block mt-4" onClick={() => void retryNow()}>
          เข้าสู่ระบบอีกครั้ง
        </button>
        {/* ⚠ <a href> ไม่ใช่ <Link> — คนละแอปคนละ origin ห้ามให้ Next เติม basePath (/arena) ให้ */}
        {portal && (
          <div className="mt-4">
            <a href={portal} className="text-sm muted">ไปหน้าแรก SchoolOS</a>
          </div>
        )}
        <div className="mt-4">
          <Link href="/" className="text-sm muted">← กลับหน้าหลัก / ดูผลการแข่งขัน</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error">{error}</div>}
      {!error && notice && <div className="alert alert-warning">{notice}</div>}
      {!error && !notice && reason && (
        <div className="alert alert-warning">
          {reason === "expired"
            ? "หมดเวลาใช้งานสูงสุดของรอบนี้ กรุณาเข้าสู่ระบบใหม่"
            : reason === "sso"
              ? "ออกจากระบบแล้วจากบริการอื่นของ SchoolOS กรุณาเข้าสู่ระบบใหม่"
              : "ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเป็นเวลานาน"}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">รหัสผู้ใช้</label>
        <input
          className="form-input"
          value={identifier}
          onChange={(e) => {
            typedRef.current = true;
            setIdentifier(e.target.value);
          }}
          placeholder="รหัสผู้ใช้"
          autoComplete="username"
          // มือถือชอบขึ้นตัวใหญ่/แก้คำให้เอง — รหัสผู้ใช้เป็นตัวเลข/ตัวอักษรตรง ๆ ห้ามแก้
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
        />
      </div>
      <div className="form-group">
        <label className="form-label">รหัสผ่าน</label>
        <input
          type="password"
          className="form-input"
          value={secret}
          onChange={(e) => {
            typedRef.current = true;
            setSecret(e.target.value);
          }}
          placeholder="รหัสผ่าน"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
        {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>

      <div className="text-center mt-4">
        {/* Link เติม basePath (/arena) ให้เอง — <a href="/"> ตรง ๆ จะวิ่งออกนอก basePath */}
        <Link href="/" className="text-sm muted">← กลับหน้าหลัก / ดูผลการแข่งขัน</Link>
      </div>
    </form>
  );
}
