"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import type { NavGroup } from "@/lib/nav";

export type NavItem = { href: string; label: string; icon: IconName };

/** จำสถานะพับของแต่ละหมวดไว้ข้ามหน้า/ข้ามการรีเฟรช (key = ชื่อ section) */
const COLLAPSE_KEY = "arena.nav.collapsed";

type CollapseMap = Record<string, boolean>;

function readCollapsed(): CollapseMap {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as CollapseMap) : {};
  } catch {
    return {};
  }
}

function isActive(path: string, href: string) {
  return path === href || (href !== "/" && path.startsWith(href + "/"));
}

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  // เริ่มด้วย "กางทุกหมวด" เสมอ เพื่อให้ HTML ฝั่ง server ตรงกับ client ตอน hydrate
  // แล้วค่อยเติมค่าที่จำไว้ใน effect
  const [collapsed, setCollapsed] = useState<CollapseMap>({});

  const update = useCallback((fn: (prev: CollapseMap) => CollapseMap) => {
    setCollapsed((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* โหมดส่วนตัว/โควตาเต็ม — ใช้งานต่อได้แค่ไม่จำสถานะ */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  // หมวดที่มีหน้าปัจจุบันอยู่ ต้องกางให้เห็นว่าอยู่ตรงไหน (เช่นเข้ามาจากลิงก์ในหน้าอื่น)
  const activeSection = groups.find((g) => g.section && g.items.some((it) => isActive(path, it.href)))?.section;
  useEffect(() => {
    if (!activeSection) return;
    update((prev) => (prev[activeSection] ? { ...prev, [activeSection]: false } : prev));
  }, [activeSection, update]);

  return (
    <nav className="side-nav">
      {groups.map((g, gi) => {
        const items = g.items.map((it) => {
          const active = isActive(path, it.href);
          return (
            <Link key={it.href} href={it.href} className={`side-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="ico">
                <Icon name={it.icon} size={20} />
              </span>
              <span>{it.label}</span>
            </Link>
          );
        });

        // กลุ่มไม่มีหัวข้อ (เช่นแดชบอร์ดเดี่ยว ๆ) พับไม่ได้ — ไม่มีที่ให้กด
        if (!g.section) {
          return (
            <div className="side-group" key={`g${gi}`}>
              {items}
            </div>
          );
        }

        const open = !collapsed[g.section];
        const panelId = `side-group-${gi}`;
        return (
          <div className={`side-group${open ? "" : " collapsed"}`} key={g.section}>
            <button
              type="button"
              className="side-section"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => update((prev) => ({ ...prev, [g.section as string]: open }))}
            >
              <span>{g.section}</span>
              <Icon name="chevron" size={18} className="side-caret" />
            </button>
            <div className="side-items" id={panelId} hidden={!open}>
              {items}
            </div>
          </div>
        );
      })}
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
