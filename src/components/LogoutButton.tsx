"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { SSO_ENABLED, ssoLogoutUrl, clearSsoCache } from "@/lib/sso";

/**
 * @param sso session ปัจจุบันผูกกับ SSO ของแพลตฟอร์มอยู่ไหม (มาจาก session.sso)
 *   true  = ออกจากระบบทั้งแพลตฟอร์มพร้อมกัน
 *   false = admin local ที่ไม่มีตัวตนบน SchoolOS — ล้างเฉพาะ session ของ arena
 *           (ไม่ไปเตะ SSO ของคนอื่นที่อาจค้างอยู่บนเบราว์เซอร์เครื่องเดียวกัน)
 */
export function LogoutButton({ sso = false }: { sso?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await api.post("/api/auth/logout");
    clearSsoCache();

    if (sso && SSO_ENABLED) {
      // ⚠ ล้างแค่ฝั่งเราไม่พอ: คุกกี้ sso_session จะยังอยู่ พอกลับเข้าหน้า login
      // ระบบจะ probe เจอว่ายังล็อกอินอยู่แล้วพากลับเข้าไปเอง = ปุ่มออกเหมือนเสีย
      // ใช้ navigation (ไม่ใช่ fetch) เพราะคุกกี้ SameSite=Lax ติดไปกับ top-level navigation แน่นอนกว่า
      window.location.href = ssoLogoutUrl("/login");
      return;
    }

    router.push("/login");
    router.refresh();
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={logout} disabled={loading}>
      ออกจากระบบ
    </button>
  );
}
