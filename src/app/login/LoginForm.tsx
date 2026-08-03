"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";

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
    router.push(nextUrl || res.data.redirect);
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error">{error}</div>}
      {!error && reason && (
        <div className="alert alert-warning">
          {reason === "expired"
            ? "หมดเวลาใช้งานสูงสุดของรอบนี้ กรุณาเข้าสู่ระบบใหม่"
            : "ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเป็นเวลานาน"}
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
