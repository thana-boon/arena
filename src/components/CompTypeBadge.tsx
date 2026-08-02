import { Icon } from "@/components/Icon";
import type { CompType } from "@/lib/domain";

/**
 * ป้ายบอกประเภทรายการ "เดี่ยว / ทีม" + จำนวนคน
 *
 * มีคนสะท้อนมาว่าเดิมใช้ .badge สีเทาเล็ก ๆ แล้ว "ทีม" กับ "เดี่ยว" มองไม่ออกในทันที
 * → แยกสีชัดเจน (เดี่ยว = ม่วงจาง, ทีม = ทองเข้ม) + ไอคอนคน 1 คน / 2 คน + บอกจำนวนคนเสมอ
 */
export function CompTypeBadge({
  type,
  teamSizeMin,
  teamSizeMax,
  size = "md",
  className = "",
}: {
  type: CompType;
  teamSizeMin?: number | null;
  teamSizeMax?: number | null;
  /** sm = ใช้ในตาราง/บรรทัดข้อความ, md = ใช้บนการ์ด (ค่าเริ่มต้น) */
  size?: "sm" | "md";
  className?: string;
}) {
  const team = type === "team";
  const cls = `type-pill${team ? " type-pill-team" : " type-pill-solo"}${size === "sm" ? " type-pill-sm" : ""}${className ? ` ${className}` : ""}`;
  // รายการทีมที่ยังไม่ได้ตั้งจำนวน (หรือหน้าที่ไม่มีข้อมูลนี้) — ไม่ต้องเว้นที่ว่างไว้เฉย ๆ
  const n = teamSizeLabel(type, teamSizeMin, teamSizeMax);
  return (
    <span className={cls}>
      <Icon name={team ? "users" : "user"} size={size === "sm" ? 12 : 14} />
      <b>{team ? "ทีม" : "เดี่ยว"}</b>
      {n && <span className="n">{n}</span>}
    </span>
  );
}

/** "1 คน" / "3 คน" / "2–3 คน" — รายการทีมที่ยังไม่ได้ตั้งจำนวนจะเหลือแค่คำว่า "ทีม" */
export function teamSizeLabel(
  type: CompType,
  teamSizeMin?: number | null,
  teamSizeMax?: number | null
): string {
  if (type !== "team") return "1 คน";
  const min = teamSizeMin ?? null;
  const max = teamSizeMax ?? null;
  if (min == null && max == null) return "";
  if (min == null || max == null) return `${min ?? max} คน`;
  return min === max ? `${min} คน` : `${min}–${max} คน`;
}
