"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { ssoConfig, ssoHandoffCode } from "@/lib/sso";
import { clearKickedOut, kickedRecently } from "@/lib/auth/clientState";

/**
 * เว้นระยะระหว่างการลอง SSO ซ้ำ — Users จำกัดการขอโค้ดไว้ 10 ครั้ง/นาที/session
 * สลับแท็บไปมาเร็ว ๆ ต้องไม่กินโควตานั้นจนหมด
 */
const RETRY_GAP_MS = 15_000;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get("next");
  // เด้งมาจากการหมดเวลาใช้งาน (ดู SessionTimeout.tsx) — บอกเหตุผล ไม่งั้นดูเหมือนระบบเตะออกเฉย ๆ
  const reason = params.get("reason");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");

  /**
   * กำลังลอง SSO อยู่ (ครั้งแรกตอนเปิดหน้าเท่านั้น)
   *
   * ⚠ เริ่มต้นเป็น true เสมอ: ระหว่างเช็คห้ามโชว์ฟอร์ม ไม่งั้นคนที่ล็อกอิน SchoolOS อยู่แล้ว
   * จะเห็นฟอร์มแวบหนึ่งก่อนถูกพาเข้าระบบ ซึ่งดูเหมือนระบบรวน
   */
  const [checking, setChecking] = useState(true);

  const attemptingRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const succeededRef = useRef(false);
  // ผู้ใช้เริ่มพิมพ์ในฟอร์มแล้วหรือยัง — พิมพ์แล้วห้าม SSO แย่งพาเข้าระบบเด็ดขาด
  // เขาตั้งใจใช้บัญชีที่กำลังกรอกอยู่ (เช่นครูยืมเครื่องให้นักเรียนล็อกอิน)
  const typedRef = useRef(false);

  /**
   * เข้าระบบด้วย session ของแพลตฟอร์ม: ขอโค้ดใช้ครั้งเดียวจาก Users แล้วให้ server เราแลกเอง
   * คืน true เมื่อกำลังพาเข้าระบบแล้ว · ล้มเหลวทางไหนก็ตกกลับมาที่ฟอร์มรหัสผ่านเสมอ
   *
   * ⚠ ห้ามขึ้น error ให้ผู้ใช้เห็นเมื่อล้มเหลว — ผู้ใช้ไม่ได้ขออะไร เขาแค่เปิดหน้า login
   * ⚠ ห้าม retry ด้วยโค้ดเดิมเด็ดขาด (โค้ดถูกใช้ไปแล้วไม่ว่าผลจะออกมาเป็นอะไร) ต้องขอใหม่เสมอ
   */
  const attempt = useCallback(async (): Promise<boolean> => {
    if (attemptingRef.current || succeededRef.current) return false;
    attemptingRef.current = true;
    lastAttemptRef.current = Date.now();
    try {
      const handoff = await ssoHandoffCode();
      if (handoff.status !== "ok") return false;
      const res = await api.post<{ redirect: string }>("/api/auth/sso", { code: handoff.code });
      if (!res.ok) return false;
      succeededRef.current = true;
      clearKickedOut();
      router.push(nextUrl || res.data.redirect);
      router.refresh();
      return true;
    } finally {
      attemptingRef.current = false;
    }
  }, [nextUrl, router]);

  // ===== เปิดหน้ามา: ลอง SSO หนึ่งครั้ง =====
  useEffect(() => {
    let alive = true;
    void (async () => {
      const cfg = await ssoConfig();
      if (!alive) return;
      // เพิ่งถูกเตะออกเพราะไม่มีการใช้งาน — ห้าม SSO ดึงกลับทันที ไม่งั้น idle timeout ไร้ความหมาย
      // และผู้ใช้ไม่ทันเห็นว่าเกิดอะไรขึ้น (ธงนี้หมดอายุเองใน 1 ช่วง idle ดู clientState.ts)
      if (!cfg.enabled || kickedRecently(cfg.idleSeconds)) return setChecking(false);
      const went = await attempt();
      if (alive && !went) setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  // ===== กลับมาที่แท็บนี้: ลองใหม่ =====
  /**
   * ⚠ จำเป็นเพราะ SPA พาไปหน้า login โดยไม่โหลดหน้าใหม่ ถ้าลองแค่ตอน mount ครั้งเดียวจะเจอเคสนี้:
   * กด logout → สลับไปล็อกอิน SchoolOS อีกแท็บ → กลับมาแท็บเดิมที่ยัง mount ค้างอยู่
   * → ไม่มีอะไรลองใหม่ให้เลย ผู้ใช้ต้องกด F5 เอง
   *
   * ลองแบบไม่ซ่อนฟอร์ม (ไม่งั้นฟอร์มกระพริบทุกครั้งที่สลับแท็บ) และอ่านธงกันใหม่ทุกครั้ง
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
        await attempt();
      })();
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("focus", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("focus", retry);
    };
  }, [attempt]);

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
    router.push(nextUrl || res.data.redirect);
    router.refresh();
  }

  if (checking) {
    return (
      <div className="text-center" style={{ padding: "24px 0" }}>
        <div className="muted">กำลังตรวจสอบการเข้าสู่ระบบ…</div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error">{error}</div>}
      {!error && reason && (
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
