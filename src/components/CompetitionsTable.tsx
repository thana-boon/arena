"use client";
import Link from "next/link";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import type { CompListItem } from "@/lib/listings";
import type { Role } from "@/lib/auth/session";
import { formatThaiDate, isUnlimited } from "@/lib/domain";

export function CompetitionsTable({
  comps,
  myCode,
  role,
  basePath,
  canPublish,
  defaultEventId = null,
}: {
  comps: CompListItem[];
  myCode: string;
  role: Role;
  basePath: string;
  canPublish: boolean;
  defaultEventId?: number | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [groupFilter, setGroupFilter] = useState<number | "all">("all");

  // งานที่มีในรายการ (ไม่ซ้ำ) — ใช้ทำ dropdown กรอง เผื่อมีหลายงานในปีเดียวกัน
  const eventOptions = useMemo(() => {
    const seen = new Map<number, { id: number; name: string }>();
    for (const c of comps) {
      const eid = c.eventId ?? -1;
      if (!seen.has(eid)) seen.set(eid, { id: eid, name: c.eventName || "ไม่ระบุงาน" });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [comps]);
  // ค่าเริ่มต้น = งานเริ่มต้นที่ admin ตั้งไว้ (ถ้ามีรายการในงานนั้น) ไม่งั้นแสดงทุกงาน
  const [eventFilter, setEventFilter] = useState<number | "all">(() =>
    defaultEventId != null && comps.some((c) => c.eventId === defaultEventId) ? defaultEventId : "all"
  );

  const canEdit = (c: CompListItem) => role === "admin" || c.createdBy === myCode;

  // รายการหลังกรองตามงาน — ใช้เป็นฐานของปุ่มกรองหมวดด้วย
  const inEvent = useMemo(
    () => (eventFilter === "all" ? comps : comps.filter((c) => (c.eventId ?? -1) === eventFilter)),
    [comps, eventFilter]
  );

  // หมวดที่มีในรายการ (ไม่ซ้ำ) — ใช้ทำปุ่มกรอง เผื่อรายการเยอะ
  const groups = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; catalogNo: number | null }>();
    for (const c of inEvent) {
      const gid = c.subjectGroupId ?? -1;
      if (!seen.has(gid))
        seen.set(gid, { id: gid, name: c.groupName || "ทั่วไป", catalogNo: c.groupCatalogNo });
    }
    return [...seen.values()].sort(
      (a, b) => (a.catalogNo ?? 9999) - (b.catalogNo ?? 9999) || a.name.localeCompare(b.name, "th")
    );
  }, [inEvent]);

  const filtered = useMemo(
    () => (groupFilter === "all" ? inEvent : inEvent.filter((c) => c.subjectGroupId === groupFilter)),
    [inEvent, groupFilter]
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
      {eventOptions.length > 1 && (
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <label className="form-label" style={{ marginBottom: 0 }}>งาน</label>
          <select
            className="form-select"
            style={{ width: "auto", maxWidth: "100%" }}
            value={eventFilter}
            onChange={(e) => {
              setEventFilter(e.target.value === "all" ? "all" : Number(e.target.value));
              setGroupFilter("all"); // งานเปลี่ยน หมวดเดิมอาจไม่มีในงานใหม่
            }}
          >
            <option value="all">ทุกงาน ({comps.length})</option>
            {eventOptions.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({comps.filter((c) => (c.eventId ?? -1) === ev.id).length})
              </option>
            ))}
          </select>
        </div>
      )}
      {groups.length > 1 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <button
            className={`btn btn-sm ${groupFilter === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setGroupFilter("all")}
          >
            ทั้งหมด ({inEvent.length})
          </button>
          {groups.map((g) => {
            const count = inEvent.filter((c) => c.subjectGroupId === g.id).length;
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
              <tr><td colSpan={6} className="muted text-sm" style={{ textAlign: "center", padding: 16 }}>ไม่มีรายการตามตัวกรองที่เลือก</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`${basePath}/${c.id}`} style={{ fontWeight: 500 }}>{c.name}</Link>
                  <div className="text-xs muted">{c.levels.join(", ")}{c.eventDate ? ` · ${formatThaiDate(c.eventDate)}` : ""}</div>
                </td>
                <td className="text-sm">{c.groupName}</td>
                <td><span className="badge">{c.type === "team" ? "ทีม" : "เดี่ยว"}</span></td>
                <td className="num">{isUnlimited(c.capacity) ? "ไม่จำกัด" : c.capacity} / {c.registered}</td>
                <td>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {c.isPublished
                      ? <span className="badge badge-success">ประกาศผลแล้ว</span>
                      : <span className="badge badge-warning">ยังไม่ประกาศ</span>}
                    {!c.visibleToStudents && <span className="badge">ซ่อนจากนักเรียน</span>}
                  </div>
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
