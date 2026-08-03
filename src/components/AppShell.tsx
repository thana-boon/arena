import Link from "next/link";
import { Sidebar, BottomNav } from "./Nav";
import { LogoutButton } from "./LogoutButton";
import { RouteTransition } from "./RouteTransition";
import { BrandLogo } from "./BrandLogo";
import { Wordmark } from "./Wordmark";
import { Avatar } from "./Avatar";
import { SessionTimeout } from "./SessionTimeout";
import { bottomNavItems, type NavGroup } from "@/lib/nav";
import { nameInitial } from "@/lib/initials";
import { IDLE_SECONDS, type SessionPayload, type Role } from "@/lib/auth/session";

const ROLE_LABEL: Record<Role, string> = {
  student: "นักเรียน",
  teacher: "ครู",
  recorder: "ผู้บันทึกผล",
  admin: "ผู้ดูแลระบบ",
};

export function AppShell({
  session,
  groups,
  children,
}: {
  session: SessionPayload;
  groups: NavGroup[];
  children: React.ReactNode;
}) {
  const initial = nameInitial(session.name, session.firstName);
  const hasPhoto = Boolean(session.photo);
  const bottom = bottomNavItems(groups);
  return (
    <div className="app-shell-nav">
      {/* เตือน + พากลับหน้า login เมื่อไม่มีการใช้งานนานเกินกำหนด */}
      <SessionTimeout idleSeconds={IDLE_SECONDS} sso={session.sso ?? false} />
      <aside className="sidebar">
        <Link href="/" className="side-brand">
          <BrandLogo />
          <Wordmark />
        </Link>
        <Sidebar groups={groups} />
        <div className="side-user">
          <Avatar initial={initial} hasPhoto={hasPhoto} />
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
            <Avatar initial={initial} hasPhoto={hasPhoto} className="avatar-sm" />
            {/* บนมือถือเหลือแค่รูปโปรไฟล์ — ชื่อ/บทบาท/ปุ่มออก ไปอยู่ในแผ่นเมนูล่างแทน */}
            <span className="nowrap hide-sm">{session.name}</span>
            <span className="hide-sm"><LogoutButton sso={session.sso ?? false} /></span>
          </div>
        </header>
        <main className="main-content"><RouteTransition>{children}</RouteTransition></main>
      </div>

      <BottomNav items={bottom.items} groups={groups} hasMore={bottom.hasMore}>
        <div className="nav-sheet-user">
          <Avatar initial={initial} hasPhoto={hasPhoto} />
          <span className="who">
            <span className="nm">{session.name}</span>
            <span className="rl">{ROLE_LABEL[session.role]}</span>
          </span>
          <LogoutButton sso={session.sso ?? false} />
        </div>
      </BottomNav>
    </div>
  );
}
