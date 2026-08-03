"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { ssoLogoutUrl, clearSsoCache } from "@/lib/sso";
import { beginSignOut, markKickedOut } from "@/lib/auth/clientState";

/**
 * @param sso session ปัจจุบันผูกกับ SSO ของแพลตฟอร์มอยู่ไหม (มาจาก session.sso)
 *   true  = ออกจากระบบทั้งแพลตฟอร์มพร้อมกัน แล้วไปจบที่หน้าแรกของ SchoolOS
 *   false = admin local ที่ไม่มีตัวตนบน SchoolOS — ล้างเฉพาะ session ของ arena
 *           (ไม่ไปเตะ SSO ของคนอื่นที่อาจค้างอยู่บนเบราว์เซอร์เครื่องเดียวกัน)
 */
export function LogoutButton({ sso = false }: { sso?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    // บอกตัวนับเวลาไว้ก่อนว่า "ผู้ใช้กดออกเอง" — 401 ที่ตามมาจาก request ที่ค้างอยู่ในท่อ
    // จะได้ไม่ถูกตีความว่าเซสชันหมดอายุ (ดู clientState.ts)
    beginSignOut();
    await api.post("/api/auth/logout");
    clearSsoCache();

    if (sso) {
      const away = await ssoLogoutUrl();
      if (away) {
        // ⚠ ล้างแค่ฝั่งเราไม่พอ: คุกกี้ของ Users จะยังอยู่ พอกลับเข้าหน้า login
        // silent SSO จะพากลับเข้าไปเอง = ปุ่มออกเหมือนเสีย (สำคัญมากกับเครื่องส่วนกลาง)
        // ⚠ ต้อง navigate ครั้งเดียว ห้ามยิง POST logout ทิ้งไว้แล้วรีบเปลี่ยนหน้า
        //   เบราว์เซอร์ยกเลิก request กลางคันได้ → ออกจาก SchoolOS ไม่สำเร็จแบบเงียบ ๆ
        window.location.assign(away);
        return;
      }
      // SSO ปิดอยู่/อ่าน config ไม่ได้ — กันไว้ไม่ให้ถูกดึงกลับเข้ามาทันทีที่หน้า login
      markKickedOut();
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
