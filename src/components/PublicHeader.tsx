import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getActiveYear } from "@/lib/queries";
import { ROLE_HOME } from "@/lib/domain";
import { BrandLogo } from "@/components/BrandLogo";

export async function PublicHeader() {
  const [session, year] = await Promise.all([getSession(), getActiveYear()]);
  return (
    <header className="navbar">
      <Link href="/" className="brand">
        <BrandLogo />
        SKDW <span className="dot">Arena</span>
      </Link>
      <span className="brand-sub">
        งานแข่งขันทางวิชาการ โรงเรียนสุคนธีรวิทย์
        {year ? ` · ปีการศึกษา ${year.yearBe}` : ""}
      </span>
      <div className="spacer" />
      <div className="row" style={{ gap: "var(--space-3)" }}>
        <Link href="/results" className="btn btn-sm btn-nav-ghost">
          ผลการแข่งขัน
        </Link>
        {session ? (
          <Link href={ROLE_HOME[session.role] ?? "/"} className="btn btn-accent btn-sm">
            เข้าสู่ระบบ
          </Link>
        ) : (
          <Link href="/login" className="btn btn-accent btn-sm">
            เข้าสู่ระบบ
          </Link>
        )}
      </div>
    </header>
  );
}
