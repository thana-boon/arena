"use client";
import Link from "next/link";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import type { CompListItem } from "@/lib/listings";
import type { Role } from "@/lib/auth/session";
import { formatThaiDate } from "@/lib/domain";

export function CompetitionsTable({
  comps,
  myCode,
  role,
  basePath,
  canPublish,
}: {
  comps: CompListItem[];
  myCode: string;
  role: Role;
  basePath: string;
  canPublish: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [groupFilter, setGroupFilter] = useState<number | "all">("all");

  const canEdit = (c: CompListItem) => role === "admin" || c.createdBy === myCode;

  // หมวดที่มีในรายการ (ไม่ซ้ำ) — ใช้ทำปุ่มกรอง เผื่อรายการเยอะ
  const groups = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; catalogNo: number | null }>();
    for (const c of comps)
      if (!seen.has(c.subjectGroupId))
        seen.set(c.subjectGroupId, { id: c.subjectGroupId, name: c.groupName, catalogNo: c.groupCatalogNo });
    return [...seen.values()].sort(
      (a, b) => (a.catalogNo ?? 9999) - (b.catalogNo ?? 9999) || a.name.localeCompare(b.name, "th")
    );
  }, [comps]);

  const filtered = useMemo(
    () => (groupFilter === "all" ? comps : comps.filter((c) => c.subjectGroupId === groupFilter)),
    [comps, groupFilter]
  );

  async function togglePublish(c: CompListItem) {
    setBusy(c.id); setMsg(null);
    const res = await api.post(`/api/competitions/${c.id}/publish`, { isPublished: !c.isPublished });
    setBusy(null);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.refresh();
  }
  async function del(c: CompListItem) {
    const ok = await confirm({
      title: "ลบรายการแข่งขัน",
      message: `ยืนยันลบรายการ "${c.name}"?`,
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    setBusy(c.id); setMsg(null);
    const res = await api.del(`/api/competitions/${c.id}`);
    setBusy(null);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.refresh();
  }

  if (!comps.length) {
    return (
      <div className="empty-state card">
        <Icon name="trophy" size={44} className="empty-ico" />
        <p>ยังไม่มีรายการแข่งขัน</p>
        <p className="text-sm">เริ่มสร้างรายการแรกเพื่อเปิดรับสมัคร</p>
        <Link href={`${basePath}/new`} className="btn btn-primary mt-4"><Icon name="plus" size={18} /> สร้างรายการ</Link>
      </div>
    );
  }

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {groups.length > 1 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <button
            className={`btn btn-sm ${groupFilter === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setGroupFilter("all")}
          >
            ทั้งหมด ({comps.length})
          </button>
          {groups.map((g) => {
            const count = comps.filter((c) => c.subjectGroupId === g.id).length;
            return (
              <button
                key={g.id}
                className={`btn btn-sm ${groupFilter === g.id ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setGroupFilter(g.id)}
              >
                {g.name} ({count})
              </button>
            );
          })}
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ชื่อรายการ</th>
              <th>หมวด</th>
              <th>ประเภท</th>
              <th className="num">รับ/สมัคร</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && (
              <tr><td colSpan={6} className="muted text-sm" style={{ textAlign: "center", padding: 16 }}>ไม่มีรายการในหมวดนี้</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`${basePath}/${c.id}`} style={{ fontWeight: 500 }}>{c.name}</Link>
                  <div className="text-xs muted">{c.levels.join(", ")}{c.eventDate ? ` · ${formatThaiDate(c.eventDate)}` : ""}</div>
                </td>
                <td className="text-sm">{c.groupName}</td>
                <td><span className="badge">{c.type === "team" ? "ทีม" : "เดี่ยว"}</span></td>
                <td className="num">{c.capacity} / {c.registered}</td>
                <td>
                  {c.isPublished
                    ? <span className="badge badge-success">ประกาศผลแล้ว</span>
                    : <span className="badge badge-warning">ยังไม่ประกาศ</span>}
                </td>
                <td className="num">
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <Link href={`${basePath}/${c.id}`} className="btn btn-ghost btn-sm">จัดการ</Link>
                    {canEdit(c) && <Link href={`${basePath}/${c.id}/edit`} className="btn btn-secondary btn-sm">แก้ไข</Link>}
                    {canPublish && (
                      <button className="btn btn-accent btn-sm" disabled={busy === c.id} onClick={() => togglePublish(c)}>
                        {c.isPublished ? "ยกเลิกประกาศ" : "ประกาศผล"}
                      </button>
                    )}
                    {canEdit(c) && (
                      <button className="btn btn-danger btn-sm" disabled={busy === c.id} onClick={() => del(c)}>ลบ</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
