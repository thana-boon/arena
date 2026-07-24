import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getActiveYear } from "@/lib/queries";
import { ROLE_HOME } from "@/lib/domain";
import { BrandLogo } from "@/components/BrandLogo";
import { Wordmark } from "@/components/Wordmark";

export async function PublicHeader() {
  const [session, year] = await Promise.all([getSession(), getActiveYear()]);
  return (
    <header className="navbar">
      <Link href="/" className="brand">
        <BrandLogo />
        <Wordmark />
      </Link>
      <span className="brand-sub">
        งานแข่งขันทางวิชาการ โรงเรียนสุคนธีรวิทย์
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
