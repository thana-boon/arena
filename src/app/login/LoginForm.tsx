"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get("next");
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

      <div className="form-group">
        <label className="form-label">รหัสผู้ใช้ / รหัสนักเรียน</label>
        <input
          className="form-input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="รหัสครู, admin หรือรหัสนักเรียน"
          autoComplete="username"
        />
      </div>
      <div className="form-group">
        <label className="form-label">รหัสผ่าน / เลขบัตรประชาชน</label>
        <input
          type="password"
          className="form-input"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="ครู: รหัสผ่าน · นักเรียน: Skdw + เลขบัตร 13 หลัก"
          autoComplete="current-password"
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
        {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>

      <div className="text-center mt-4">
        <a href="/" className="text-sm muted">← กลับหน้าหลัก / ดูผลการแข่งขัน</a>
      </div>
    </form>
  );
}
