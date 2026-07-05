import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ROLE_HOME } from "@/lib/domain";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.role] ?? "/");
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="text-center mb-4">
          <div style={{ fontFamily: "var(--font-en-serif)", fontSize: 28, fontWeight: 700, color: "var(--skdw-purple)" }}>
            Su<span className="wordmark-k" style={{ color: "var(--skdw-gold-dark)" }}>K</span>hon{" "}
            <span style={{ color: "var(--skdw-gold-dark)" }}>Arena</span>
          </div>
          <div className="muted text-sm">ระบบจัดการการแข่งขันทางวิชาการ</div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
