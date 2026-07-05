"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };

export function Sidebar({ items, section }: { items: NavItem[]; section?: string }) {
  const path = usePathname();
  return (
    <nav className="sidebar">
      {section && <div className="sidebar-section">{section}</div>}
      {items.map((it) => {
        const active = path === it.href || (it.href !== "/" && path.startsWith(it.href + "/"));
        return (
          <Link key={it.href} href={it.href} className={`sidebar-item${active ? " active" : ""}`}>
            <span className="ico">{it.icon}</span>
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="bottom-nav">
      {items.slice(0, 5).map((it) => {
        const active = path === it.href || (it.href !== "/" && path.startsWith(it.href + "/"));
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""}>
            <span className="ico">{it.icon}</span>
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
