"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { SSO_ENABLED, ssoProbe, ssoHandoffCode, ssoLogin, clearSsoCache, type SsoUser } from "@/lib/sso";

/** สถานะการเช็ค SSO ตอนเปิดหน้า — ต้องจบได้ทุกทาง ห้ามค้างที่ checking */
type SsoState =
  | { kind: "checking" }
  | { kind: "signing-in"; user: SsoUser } // เจอ session แพลตฟอร์ม กำลังพาเข้าระบบ
  | { kind: "offer"; user: SsoUser } // ล็อกอินอยู่ แต่ให้กดยืนยันเอง (เพิ่งถูกเตะออกเพราะหมดเวลา)
  | { kind: "none" }; // ไม่ได้ล็อกอิน / Users ล่ม → ใช้ฟอร์มรหัสผ่านตามปกติ

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
  const [sso, setSso] = useState<SsoState>(SSO_ENABLED ? { kind: "checking" } : { kind: "none" });
  const startedRef = useRef(false);

  const go = useCallback(
    (redirect: string) => {
      router.push(nextUrl || redirect);
      router.refresh();
    },
    [nextUrl, router]
  );

  /**
   * เข้าระบบด้วย session ของแพลตฟอร์ม: ขอโค้ดใช้ครั้งเดียวจาก Users แล้วให้ server เราแลกเอง
   * ล้มเหลวทางไหนก็ตกกลับมาที่ฟอร์มรหัสผ่านเสมอ — ห้ามค้างหน้าเปล่า
   */
  const signInWithSso = useCallback(
    async (user: SsoUser) => {
      setSso({ kind: "signing-in", user });
      const handoff = await ssoHandoffCode();
      if (handoff.status !== "ok") {
        clearSsoCache();
        setSso({ kind: "none" });
        return;
      }
      const res = await api.post<{ redirect: string }>("/api/auth/sso", { code: handoff.code });
      if (!res.ok) {
        setError(res.error);
        setSso({ kind: "none" });
        return;
      }
      go(res.data.redirect);
    },
    [go]
  );

  // เปิดหน้ามา — ถามแพลตฟอร์มก่อนว่าล็อกอินอยู่แล้วหรือยัง (ต้องเป็น client-side เท่านั้น
  // เพราะคุกกี้อยู่ที่ origin ของ Users ฝั่ง server ของเราไม่มีทางเห็น)
  useEffect(() => {
    if (!SSO_ENABLED || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const probe = await ssoProbe({ force: true });
      if (probe.status !== "valid") return setSso({ kind: "none" });
      // เพิ่งถูกระบบเตะออกเพราะไม่มีการใช้งาน/หมดเวลา — ไม่พากลับเข้าเองทันที ไม่งั้นเท่ากับ
      // ยกเลิก idle timeout ของ arena ทิ้ง ให้ผู้ใช้กดยืนยันเองหนึ่งครั้ง
      if (reason) return setSso({ kind: "offer", user: probe.user });
      await signInWithSso(probe.user);
    })();
  }, [reason, signInWithSso]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // ฟอร์มเดียว: ส่ง identifier + secret แล้วให้ server ตรวจเองว่าเป็น admin / ครู / นักเรียน
    const res = await api.post<{ redirect: string }>("/api/auth/login", {
      identifier: identifier.trim(),
      secret,
    });
    if (!res.ok) {
      setLoading(false);
      setError(res.error);
      return;
    }

    // ล็อกอินที่นี่สำเร็จแล้ว → พาเข้าแพลตฟอร์มต่อให้ด้วย เพื่อให้บริการอื่นของ SchoolOS
    // เห็นว่าล็อกอินแล้วเช่นกัน (best-effort: ล้มเหลวก็ไม่กระทบการเข้าใช้ arena)
    // แล้วต่อด้วย handoff เพื่ออัปเกรด session ของเราให้เป็นแบบผูก SSO — ทำให้ logout
    // จากบริการอื่นแล้ว session ฝั่งเราดับตามด้วย (ดู SessionTimeout.tsx)
    // admin local ไม่มีตัวตนบน SchoolOS จึงล้มเหลวตรงนี้เสมอ ซึ่งถูกต้องแล้ว
    if (SSO_ENABLED) {
      const plat = await ssoLogin(identifier.trim(), secret);
      if (plat.status === "ok") {
        const handoff = await ssoHandoffCode();
        if (handoff.status === "ok") await api.post("/api/auth/sso", { code: handoff.code });
      }
    }

    setLoading(false);
    go(res.data.redirect);
  }

  if (sso.kind === "checking" || sso.kind === "signing-in") {
    return (
      <div className="text-center" style={{ padding: "24px 0" }}>
        <div className="muted">
          {sso.kind === "checking"
            ? "กำลังตรวจสอบการเข้าสู่ระบบ…"
            : `กำลังพาเข้าระบบในชื่อ ${sso.user.name}…`}
        </div>
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

      {sso.kind === "offer" && (
        <div className="alert alert-info">
          <div className="mb-2">
            ยังเข้าสู่ระบบ SchoolOS อยู่ในชื่อ <b>{sso.user.name}</b>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => void signInWithSso(sso.user)}
          >
            ใช้บัญชีนี้เข้าสู่ระบบต่อ
          </button>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">รหัสผู้ใช้</label>
        <input
          className="form-input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
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
          onChange={(e) => setSecret(e.target.value)}
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
