"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ThaiDatePicker } from "@/components/ThaiDatePicker";
import { AUDIT_GROUPS, actionLabel } from "@/lib/auditActions";

export type AuditFilterValues = {
  q: string;
  action: string; // "" | "<action>" | "g:<groupKey>"
  who: string;
  from: string; // ISO "YYYY-MM-DD"
  to: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

/** ปุ่มช่วงเวลาสำเร็จรูป — ครูส่วนใหญ่อยากดู "ที่เพิ่งเกิด" ไม่ได้อยากไล่ปฏิทิน */
const PRESETS: { label: string; from: string; to: string }[] = [
  { label: "วันนี้", from: daysAgo(0), to: daysAgo(0) },
  { label: "7 วัน", from: daysAgo(6), to: "" },
  { label: "30 วัน", from: daysAgo(29), to: "" },
];

export function AuditFilters({
  initial,
  actions,
  people,
}: {
  initial: AuditFilterValues;
  /** action ที่มีอยู่จริงใน log — dropdown จะได้ไม่ยาวด้วยตัวเลือกที่กรองแล้วว่าง */
  actions: string[];
  people: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<AuditFilterValues>(initial);

  const set = (patch: Partial<AuditFilterValues>) => setV((prev) => ({ ...prev, ...patch }));

  /** ยิงตัวกรองขึ้น URL — เก็บสถานะไว้ที่ URL เพื่อกด back / บุ๊กมาร์ก / ส่งลิงก์ให้กันได้ */
  function apply(patch: Partial<AuditFilterValues> = {}) {
    const next = { ...v, ...patch };
    setV(next);
    const sp = new URLSearchParams();
    if (next.q.trim()) sp.set("q", next.q.trim());
    if (next.action) sp.set("action", next.action);
    if (next.who) sp.set("who", next.who);
    if (next.from) sp.set("from", next.from);
    if (next.to) sp.set("to", next.to);
    const qs = sp.toString();
    // href ของ next/link + router ถูกเติม basePath ให้อัตโนมัติ ห้ามใส่ /arena เอง
    start(() => router.push(qs ? `/admin/audit?${qs}` : "/admin/audit"));
  }

  function reset() {
    setV({ q: "", action: "", who: "", from: "", to: "" });
    start(() => router.push("/admin/audit"));
  }

  const hasFilter = Boolean(v.q || v.action || v.who || v.from || v.to);
  // action ที่มีจริง จัดเข้าหมวด (ตัวที่ไม่รู้จักไปกอง "อื่น ๆ")
  const known = new Set(AUDIT_GROUPS.flatMap((g) => g.actions));
  const others = actions.filter((a) => !known.has(a));

  // ตั้งแต่บันทึกการลงทะเบียนของนักเรียนด้วย รายชื่อ "ผู้ทำ" ยาวขึ้นเป็นหลักร้อย
  // แยกครู (มีชื่อจากสิทธิ์ที่ให้ไว้) ออกมาไว้บนสุด ที่เหลือคือรหัสนักเรียนกองไว้ด้านล่าง
  const staff = people.filter((p) => p.name);
  const students = people.filter((p) => !p.name);

  return (
    <div className="card stack">
      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
          <label className="form-label">ค้นหา</label>
          <input
            className="form-input"
            value={v.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="ชื่อการกระทำ ผู้ทำ หรือคำในรายละเอียด"
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0, width: 210 }}>
          <label className="form-label">การกระทำ</label>
          <select
            className="form-select"
            value={v.action}
            onChange={(e) => apply({ action: e.target.value })}
          >
            <option value="">ทั้งหมด</option>
            {AUDIT_GROUPS.map((g) => {
              const inLog = g.actions.filter((a) => actions.includes(a));
              if (!inLog.length) return null;
              return (
                <optgroup key={g.key} label={g.label}>
                  <option value={`g:${g.key}`}>— ทั้งหมวด {g.label} —</option>
                  {inLog.map((a) => (
                    <option key={a} value={a}>
                      {actionLabel(a)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            {others.length > 0 && (
              <optgroup label="อื่น ๆ">
                {others.map((a) => (
                  <option key={a} value={a}>
                    {actionLabel(a)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0, width: 190 }}>
          <label className="form-label">ผู้ทำ</label>
          <select className="form-select" value={v.who} onChange={(e) => apply({ who: e.target.value })}>
            <option value="">ทุกคน</option>
            {staff.length > 0 && (
              <optgroup label="ครู / เจ้าหน้าที่">
                {staff.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </optgroup>
            )}
            {students.length > 0 && (
              <optgroup label="นักเรียน (รหัส)">
                {students.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0, width: 170 }}>
          <label className="form-label">ตั้งแต่วันที่</label>
          <ThaiDatePicker value={v.from} onChange={(from) => apply({ from })} placeholder="— ไม่จำกัด —" />
        </div>

        <div className="form-group" style={{ marginBottom: 0, width: 170 }}>
          <label className="form-label">ถึงวันที่</label>
          <ThaiDatePicker value={v.to} onChange={(to) => apply({ to })} placeholder="— ไม่จำกัด —" />
        </div>

        <button className="btn btn-primary" disabled={pending}>
          <Icon name="search" size={16} /> {pending ? "กำลังกรอง…" : "ค้นหา"}
        </button>
      </form>

      <div className="row" style={{ gap: 8 }}>
        <span className="text-sm muted">ช่วงเวลา:</span>
        {PRESETS.map((p) => {
          const on = v.from === p.from && v.to === p.to;
          return (
            <button
              key={p.label}
              type="button"
              className={`btn btn-sm ${on ? "btn-primary" : "btn-secondary"}`}
              onClick={() => apply({ from: p.from, to: p.to })}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          className={`btn btn-sm ${!v.from && !v.to ? "btn-primary" : "btn-secondary"}`}
          onClick={() => apply({ from: "", to: "" })}
        >
          ทั้งหมด
        </button>
        {hasFilter && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={reset} style={{ marginLeft: "auto" }}>
            <Icon name="close" size={16} /> ล้างตัวกรอง
          </button>
        )}
      </div>
    </div>
  );
}
