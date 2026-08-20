"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { ssoExitUrl, clearSsoCache } from "@/lib/sso";
import { beginSignOut, markKickedOut } from "@/lib/auth/clientState";
import { Icon } from "@/components/Icon";

/**
 * @param sso session ปัจจุบันผูกกับ SSO ของแพลตฟอร์มอยู่ไหม (มาจาก session.sso)
 *   true  = ออกจากระบบทั้งแพลตฟอร์มพร้อมกัน แล้วไปจบที่หน้าแรกของ SchoolOS
 *   false = admin local ที่ไม่มีตัวตนบน SchoolOS — ล้างเฉพาะ session ของ arena แล้วพากลับ
 *           หน้าแรกของ SchoolOS เหมือนกัน (ไม่ไปเตะ SSO ของคนอื่นที่อาจค้างอยู่บนเครื่องเดียวกัน)
 * @param variant "menu" = แถวในเมนูผู้ใช้ (มีไอคอน เต็มความกว้าง) · ค่าปกติ = ปุ่มเล็กแบบเดิม
 */
export function LogoutButton({ sso = false, variant = "button" }: { sso?: boolean; variant?: "button" | "menu" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    // บอกตัวนับเวลาไว้ก่อนว่า "ผู้ใช้กดออกเอง" — 401 ที่ตามมาจาก request ที่ค้างอยู่ในท่อ
    // จะได้ไม่ถูกตีความว่าเซสชันหมดอายุ (ดู clientState.ts)
    beginSignOut();
    await api.post("/api/auth/logout");
    clearSsoCache();

    // ออกจากระบบแล้วต้องไปโผล่หน้าแรกของ SchoolOS เสมอ ไม่ค้างอยู่หน้า login ของเรา
    // (session ที่ผูก SSO จะออกจากแพลตฟอร์มระหว่างทางด้วย — ดู ssoExitUrl)
    const away = await ssoExitUrl(sso);
    if (away) {
      // ⚠ ล้างแค่ฝั่งเราไม่พอ: คุกกี้ของ Users จะยังอยู่ พอกลับเข้าหน้า login
      // silent SSO จะพากลับเข้าไปเอง = ปุ่มออกเหมือนเสีย (สำคัญมากกับเครื่องส่วนกลาง)
      // ⚠ ต้อง navigate ครั้งเดียว ห้ามยิง POST logout ทิ้งไว้แล้วรีบเปลี่ยนหน้า
      //   เบราว์เซอร์ยกเลิก request กลางคันได้ → ออกจาก SchoolOS ไม่สำเร็จแบบเงียบ ๆ
      window.location.assign(away);
      return;
    }

    // SSO ปิดอยู่/อ่าน config ไม่ได้ — กันไว้ไม่ให้ถูกดึงกลับเข้ามาทันทีที่หน้า login
    if (sso) markKickedOut();
    router.push("/login");
    router.refresh();
  }

  if (variant === "menu") {
    return (
      <button type="button" className="um-item" role="menuitem" onClick={logout} disabled={loading}>
        <Icon name="logout" size={18} />
        <span>{loading ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}</span>
      </button>
    );
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={logout} disabled={loading}>
      ออกจากระบบ
    </button>
  );
}
