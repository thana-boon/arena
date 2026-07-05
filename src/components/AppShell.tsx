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
  return (
    <div className="app-shell">
      <header className="navbar">
        <Link href="/" className="brand">
          <BrandLogo />
          <Wordmark />
        </Link>
        <div className="spacer" />
        <div className="nav-user">
          <span className="role-chip">{ROLE_LABEL[session.role]}</span>
          <span className="nowrap">{session.name}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="app-body">
        <Sidebar items={items} section={section} />
        <main className="main-content"><RouteTransition>{children}</RouteTransition></main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
