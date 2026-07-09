import Link from "next/link";
import { Sidebar, BottomNav, type NavItem } from "./Nav";
import { LogoutButton } from "./LogoutButton";
import { RouteTransition } from "./RouteTransition";
import { BrandLogo } from "./BrandLogo";
import { Wordmark } from "./Wordmark";
import type { SessionPayload, Role } from "@/lib/auth/session";

const ROLE_LABEL: Record<Role, string> = {
  student: "นักเรียน",
  teacher: "ครู",
  recorder: "ผู้บันทึกผล",
  admin: "ผู้ดูแลระบบ",
};

export function AppShell({
  session,
  items,
  section,
  children,
}: {
  session: SessionPayload;
  items: NavItem[];
  section?: string;
  children: React.ReactNode;
}) {
  const initial = (session.name ?? "?").trim().charAt(0) || "?";
  return (
    <div className="app-shell-nav">
      <aside className="sidebar">
        <Link href="/" className="side-brand">
          <BrandLogo />
          <Wordmark />
        </Link>
        <Sidebar items={items} section={section} />
        <div className="side-user">
          <span className="avatar" aria-hidden="true">{initial}</span>
          <span className="who">
            <span className="nm">{session.name}</span>
            <span className="rl">{ROLE_LABEL[session.role]}</span>
          </span>
        </div>
      </aside>

      <div className="app-col">
        <header className="topbar">
          <Link href="/" className="tb-brand"><Wordmark /></Link>
          <div className="spacer" />
          <div className="tb-user">
            <span className="role-chip">{ROLE_LABEL[session.role]}</span>
            <span className="nowrap">{session.name}</span>
            <LogoutButton />
          </div>
        </header>
        <main className="main-content"><RouteTransition>{children}</RouteTransition></main>
      </div>

      <BottomNav items={items} />
    </div>
  );
}
