import Link from "next/link";
import { Sidebar, BottomNav } from "./Nav";
import { LogoutButton } from "./LogoutButton";
import { RouteTransition } from "./RouteTransition";
import { BrandLogo } from "./BrandLogo";
import { Wordmark } from "./Wordmark";
import { Avatar } from "./Avatar";
import { UserMenu } from "./UserMenu";
import { SessionTimeout } from "./SessionTimeout";
import { SessionGuard } from "./SessionGuard";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { ViewAsToggle } from "./ViewAsToggle";
import { bottomNavItems, type NavGroup } from "@/lib/nav";
import { nameInitial } from "@/lib/initials";
import { getAnnouncementsFor } from "@/lib/announcements";
import type { AnnouncementView } from "@/lib/announcementTypes";
import { idleSeconds, type Session, type Role } from "@/lib/auth/session";

const ROLE_LABEL: Record<Role, string> = {
  student: "นักเรียน",
  teacher: "ครู",
  recorder: "ผู้บันทึกผล",
  admin: "ผู้ดูแลระบบ",
};

export async function AppShell({
  session,
  groups,
  children,
}: {
  session: Session;
  groups: NavGroup[];
  children: React.ReactNode;
}) {
  const initial = nameInitial(session.name, session.firstName);
  const hasPhoto = Boolean(session.photo);
  const bottom = bottomNavItems(groups);
  // ผู้ดูแลระบบสลับไปใช้งานแบบครูทั่วไปได้ (ดู setViewAs) — ตัดสินจากบทบาทจริง ไม่ใช่บทบาทที่กำลังใช้
  const asTeacher = session.realRole === "admin";
  const viewAs = asTeacher || session.role === "admin" ? { asTeacher } : undefined;
  const roleLabel = asTeacher ? "ครู (โหมดของผู้ดูแลระบบ)" : ROLE_LABEL[session.role];
  // ประกาศจาก admin — DB ล่ม/ตารางยังไม่มี ต้องไม่ทำให้ทั้งเว็บพัง (แถบประกาศไม่ใช่ของจำเป็นต่อการทำงาน)
  let announcements: AnnouncementView[] = [];
  try {
    announcements = await getAnnouncementsFor(session.role);
  } catch (e) {
    console.error("โหลดประกาศไม่สำเร็จ", e);
  }
  return (
    <div className="app-shell-nav">
      {/* เตือน + พากลับหน้า login เมื่อไม่มีการใช้งานนานเกินกำหนด */}
      <SessionTimeout
        idleSeconds={idleSeconds(session.client)}
        sso={session.sso ?? false}
        client={session.client}
      />
      {/* สลับผู้ใช้ให้ตรงกับคนที่ล็อกอิน SchoolOS อยู่จริง ณ วินาทีนี้ (เครื่องส่วนกลางใช้ต่อกันหลายคน) */}
      <SessionGuard sso={session.sso ?? false} ssoSub={session.ssoSub} />
      <aside className="sidebar">
        <Link href="/" className="side-brand">
          <BrandLogo />
          <Wordmark />
        </Link>
        <Sidebar groups={groups} />
        <div className="side-user">
          <Avatar initial={initial} hasPhoto={hasPhoto} owner={session.code} />
          <span className="who">
            <span className="nm">{session.name}</span>
            <span className="rl">{roleLabel}</span>
          </span>
        </div>
      </aside>

      <div className="app-col">
        <header className="topbar">
          <Link href="/" className="tb-brand"><Wordmark /></Link>
          <div className="spacer" />
          <div className="tb-user">
            {/* กดรูปโปรไฟล์ = เมนูผู้ใช้ (ชื่อ/บทบาท + ออกจากระบบ) ใช้ได้เหมือนกันทั้งมือถือและจอใหญ่ */}
            <UserMenu
              name={session.name}
              roleLabel={roleLabel}
              initial={initial}
              hasPhoto={hasPhoto}
              code={session.code}
              sso={session.sso ?? false}
              viewAs={viewAs}
            />
          </div>
        </header>
        <main className="main-content">
          {/* ประกาศอยู่นอก RouteTransition — ค้างอยู่กับที่ตอนสลับหน้า ไม่กะพริบตามเนื้อหา */}
          <AnnouncementBanner items={announcements} />
          {/* เตือนตลอดว่ากำลังอยู่ในโหมดครู — ไม่งั้นลืมแล้วนึกว่าสิทธิ์ admin หาย */}
          {asTeacher && (
            <div className="viewas-bar" role="status">
              <span>กำลังใช้งานแบบครูทั่วไป · เห็นและทำได้เท่าที่ครูในหมวดทำได้</span>
              <ViewAsToggle asTeacher />
            </div>
          )}
          <RouteTransition>{children}</RouteTransition>
        </main>
      </div>

      <BottomNav items={bottom.items} groups={groups} hasMore={bottom.hasMore}>
        <div className="nav-sheet-user">
          <Avatar initial={initial} hasPhoto={hasPhoto} owner={session.code} />
          <span className="who">
            <span className="nm">{session.name}</span>
            <span className="rl">{roleLabel}</span>
          </span>
          <LogoutButton sso={session.sso ?? false} />
        </div>
      </BottomNav>
    </div>
  );
}
