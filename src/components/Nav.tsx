"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import type { NavGroup } from "@/lib/nav";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** ชื่อย่อสำหรับแถบล่างบนมือถือ (ช่องแคบ — ชื่อเต็มบางอันยาวเกินไป) */
  short?: string;
  /** เมนูหลักที่ต้องกดถึงได้ในหนึ่งนิ้วบนมือถือ — ขึ้นแถบล่าง ไม่ต้องเปิดเมนู */
  primary?: boolean;
};

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

/**
 * เมนูไหนคือหน้าที่เปิดอยู่ — ปกติเทียบแบบขึ้นต้น (path ลูกทำให้เมนูแม่สว่าง เช่น
 * /admin/competitions/5/edit → "รายการแข่งขัน") ยกเว้นหน้าแรกของแต่ละบทบาท
 * (/admin, /teacher, /student) ที่เป็นต้นทางของทุก path ในบทบาทนั้น — ถ้าเทียบแบบขึ้นต้น
 * "แดชบอร์ด" จะสว่างค้างอยู่ทุกหน้า จึงต้องตรงเป๊ะเท่านั้น
 */
function isActive(path: string, href: string) {
  const isRoleHome = href.split("/").filter(Boolean).length <= 1;
  if (isRoleHome) return path === href;
  return path === href || path.startsWith(href + "/");
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

/**
 * แถบเมนูล่างบนมือถือ — เมนูหลักไม่เกิน 4 อัน + ปุ่ม "เมนู" เปิดแผ่นรวมเมนูทั้งหมด
 * (เดิมยัดทุกเมนูเรียงกันแล้วเลื่อนแนวนอน ซึ่งบนมือถือแทบไม่มีใครรู้ว่าเลื่อนได้)
 */
export function BottomNav({
  items,
  groups,
  hasMore,
  children,
}: {
  items: NavItem[];
  groups: NavGroup[];
  hasMore: boolean;
  /** ส่วนท้ายแผ่นเมนู (ชื่อผู้ใช้ + ปุ่มออกจากระบบ) — ประกอบมาจาก AppShell ฝั่ง server */
  children?: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // เปลี่ยนหน้าแล้วปิดแผ่นเมนูเอง
  useEffect(() => setOpen(false), [path]);

  // เปิดแผ่นเมนูอยู่ = ล็อกไม่ให้หน้าด้านหลังเลื่อนตาม
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // ขยายจอ/หมุนเครื่องจนกลับไปโหมด sidebar — ต้องปิดเอง ไม่งั้นหน้าค้างเลื่อนไม่ได้
    const onResize = () => window.innerWidth > 768 && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // เมนูที่อยู่ในแผ่น (ไม่ได้อยู่บนแถบล่าง) ถ้าถูกเปิดอยู่ ให้ปุ่ม "เมนู" สว่างแทน
  const shownHrefs = new Set(items.map((i) => i.href));
  const moreActive = groups.some((g) => g.items.some((it) => !shownHrefs.has(it.href) && isActive(path, it.href)));

  return (
    <>
      <nav className="bottom-nav">
        {items.map((it) => {
          const active = isActive(path, it.href);
          return (
            <Link key={it.href} href={it.href} className={active ? "active" : ""}>
              <span className="ico">
                <Icon name={it.icon} size={22} />
              </span>
              <span>{it.short ?? it.label}</span>
            </Link>
          );
        })}
        {hasMore && (
          <button type="button" className={`bn-more${moreActive || open ? " active" : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span className="ico">
              <Icon name={open ? "close" : "menu"} size={22} />
            </span>
            <span>เมนู</span>
          </button>
        )}
      </nav>

      {open && (
        <div className="nav-sheet-overlay" onClick={() => setOpen(false)}>
          <div className="nav-sheet" role="dialog" aria-modal="true" aria-label="เมนูทั้งหมด" onClick={(e) => e.stopPropagation()}>
            <div className="nav-sheet-grip" aria-hidden="true" />
            <div className="nav-sheet-body">
              {groups.map((g, gi) => (
                <div className="nav-sheet-group" key={g.section ?? `g${gi}`}>
                  {g.section && <div className="nav-sheet-section">{g.section}</div>}
                  {g.items.map((it) => {
                    const active = isActive(path, it.href);
                    return (
                      <Link key={it.href} href={it.href} className={`nav-sheet-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                        <span className="ico">
                          <Icon name={it.icon} size={20} />
                        </span>
                        <span>{it.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
            {children && <div className="nav-sheet-foot">{children}</div>}
          </div>
        </div>
      )}
    </>
  );
}
