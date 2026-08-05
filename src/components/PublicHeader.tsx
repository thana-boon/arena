import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getDefaultEvent } from "@/lib/queries";
import { ROLE_HOME } from "@/lib/domain";
import { Icon } from "@/components/Icon";
import { BrandLogo } from "@/components/BrandLogo";
import { Wordmark } from "@/components/Wordmark";

export async function PublicHeader() {
  const [session, { year, event }] = await Promise.all([getSession(), getDefaultEvent()]);
  // ชื่องานตาม "งานเริ่มต้น" ในหน้าตั้งค่า — ยังไม่ได้เลือกงานค่อยใช้ข้อความกลาง ๆ
  const title = event?.name ?? "งานแข่งขันทางวิชาการ โรงเรียนสุคนธีรวิทย์";
  return (
    <header className="navbar">
      {/* กรอบในกว้างเท่า .main-content — โลโก้จะตรงแนวกับหัวเรื่องของหน้า */}
      <div className="navbar-inner">
        <Link href="/" className="brand">
          <BrandLogo />
          <Wordmark />
        </Link>
        <span className="brand-sub">
          {title}
          {year ? ` · ปีการศึกษา ${year.yearBe}` : ""}
        </span>
        <div className="spacer" />
        <div className="nav-actions">
          {/* จอแคบมาก (iPhone) เหลือแค่ไอคอน — ถ้าปล่อยข้อความไว้ทั้งคู่ แถบบนจะกว้างเกินจอแล้วเลื่อนซ้าย-ขวาได้ */}
          <Link href="/results" className="btn btn-sm btn-nav-ghost" title="ผลการแข่งขัน">
            <Icon name="trophy" size={15} />
            <span className="nav-label">ผลการแข่งขัน</span>
          </Link>
          <Link href={session ? ROLE_HOME[session.role] ?? "/" : "/login"} className="btn btn-accent btn-sm">
            {session ? "เข้าใช้งาน" : "เข้าสู่ระบบ"}
          </Link>
        </div>
      </div>
    </header>
  );
}
