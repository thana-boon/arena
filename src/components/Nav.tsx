"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import type { NavGroup } from "@/lib/nav";

export type NavItem = { href: string; label: string; icon: IconName };

function isActive(path: string, href: string) {
  return path === href || (href !== "/" && path.startsWith(href + "/"));
}

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  return (
    <nav className="side-nav">
      {groups.map((g, gi) => (
        <div className="side-group" key={g.section ?? `g${gi}`}>
          {g.section && <div className="side-section">{g.section}</div>}
          {g.items.map((it) => {
            const active = isActive(path, it.href);
            return (
              <Link key={it.href} href={it.href} className={`side-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                <span className="ico">
                  <Icon name={it.icon} size={20} />
                </span>
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="bottom-nav">
      {items.map((it) => {
        const active = path === it.href || (it.href !== "/" && path.startsWith(it.href + "/"));
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""}>
            <span className="ico">
              <Icon name={it.icon} size={22} />
            </span>
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
