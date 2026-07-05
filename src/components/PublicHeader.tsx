import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/domain";
import { BrandLogo } from "@/components/BrandLogo";

export async function PublicHeader() {
  const session = await getSession();
  return (
    <header className="navbar">
      <Link href="/" className="brand">
        <BrandLogo />
        SKDW <span className="dot">Arena</span>
      </Link>
      <div className="spacer" />
      <div className="row" style={{ gap: "var(--space-4)" }}>
        <Link href="/results" style={{ color: "#fff" }}>
          ผลการแข่งขัน
        </Link>
        {session ? (
          <Link href={ROLE_HOME[session.role] ?? "/"} className="btn btn-accent btn-sm">
            เข้าพื้นที่ของฉัน
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
