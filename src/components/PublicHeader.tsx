import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getDefaultEvent } from "@/lib/queries";
import { ROLE_HOME } from "@/lib/domain";
import { BrandLogo } from "@/components/BrandLogo";
import { Wordmark } from "@/components/Wordmark";

export async function PublicHeader() {
  const [session, { year, event }] = await Promise.all([getSession(), getDefaultEvent()]);
  // ชื่องานตาม "งานเริ่มต้น" ในหน้าตั้งค่า — ยังไม่ได้เลือกงานค่อยใช้ข้อความกลาง ๆ
  const title = event?.name ?? "งานแข่งขันทางวิชาการ โรงเรียนสุคนธีรวิทย์";
  return (
    <header className="navbar">
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
        <Link href="/results" className="btn btn-sm btn-nav-ghost">
          ผลการแข่งขัน
        </Link>
        <Link href={session ? ROLE_HOME[session.role] ?? "/" : "/login"} className="btn btn-accent btn-sm">
          เข้าสู่ระบบ
        </Link>
      </div>
    </header>
  );
}
