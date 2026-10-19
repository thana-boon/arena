"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";

export type TeacherOption = {
  code: string;
  name: string;
  /** ชื่อกลุ่มสาระ ("" = ไม่ระบุ) — ใช้กรอง/จัดกลุ่มเท่านั้น */
  group: string;
  /** ไม่อยู่ในรายชื่อครูที่ยังทำงานอยู่แล้ว (ลาออก/ย้าย) แต่ถูกติ๊กไว้ก่อนหน้า */
  inactive?: boolean;
};

/**
 * ติ๊กรายชื่อครูที่เข้าร่วมกิจกรรมของครู — ใช้แทนตารางเช็คชื่อนักเรียน
 *
 * ครูไม่ได้สมัครเอง ผู้จัดเลือกจากรายชื่อครูทั้งโรงเรียนแล้วกดบันทึกครั้งเดียว
 * ติ๊ก = เข้าร่วม = ได้เกียรติบัตร "เข้าร่วมกิจกรรม" · ไม่ติ๊ก = ไม่อยู่ในรายชื่อ
 */
export function TeacherPicker({
  competitionId,
  teachers,
  initialCodes,
  checkedAtText,
  loadError,
}: {
  competitionId: number;
  teachers: TeacherOption[];
  /** รหัสครูที่ติ๊กไว้แล้ว */
  initialCodes: string[];
  /** บันทึกครั้งล่าสุดเมื่อไหร่ — null = ยังไม่เคยบันทึก */
  checkedAtText: string | null;
  /** ดึงรายชื่อครูจาก SchoolOS ไม่สำเร็จ — ยังเห็นคนที่ติ๊กไว้แล้ว แต่เพิ่มคนใหม่ไม่ได้ */
  loadError: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialCodes));
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(checkedAtText);

  const groups = useMemo(
    () => [...new Set(teachers.map((t) => t.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")),
    [teachers]
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return teachers.filter(
      (t) =>
        (!group || t.group === group) &&
        (!onlyPicked || picked.has(t.code)) &&
        (!needle || t.name.toLowerCase().includes(needle) || t.code.toLowerCase().includes(needle))
    );
  }, [teachers, q, group, onlyPicked, picked]);

  const toggle = (code: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });

  // ติ๊ก/ล้าง เฉพาะคนที่กำลังแสดงอยู่ — กรองกลุ่มสาระแล้วกด "ติ๊กทั้งหมด" = ติ๊กทั้งกลุ่มสาระ
  const setShown = (on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const t of shown) {
        if (on) next.add(t.code);
        else next.delete(t.code);
      }
      return next;
    });

  async function save() {
    setBusy(true);
    const res = await api.post<{ present: number; keptForCertificates: number }>(
      `/api/competitions/${competitionId}/teachers`,
      { teacherCodes: [...picked] }
    );
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setSavedAt("เมื่อสักครู่");
    toast(
      `บันทึกรายชื่อแล้ว · ครูเข้าร่วม ${res.data.present} คน` +
        (res.data.keptForCertificates
          ? ` · ${res.data.keptForCertificates} คนที่เอาติ๊กออกได้รับเกียรติบัตรไปแล้ว ใบเดิมยังอยู่ (แจ้งผู้ดูแลระบบถ้าต้องการยกเลิก)`
          : "")
    );
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="alert alert-info">
        ติ๊กชื่อครูที่เข้าร่วมกิจกรรมนี้ แล้วกด “บันทึกรายชื่อ” — ครูที่ติ๊กจะได้เกียรติบัตร “เข้าร่วมกิจกรรม”
        {!savedAt && (
          <>
            <br />
            <strong>ยังไม่ได้บันทึกรายชื่อ</strong> — ต้องบันทึกอย่างน้อยหนึ่งครั้งจึงจะออกเกียรติบัตรได้
          </>
        )}
      </div>
      {loadError && (
        <div className="alert alert-warning">
          ดึงรายชื่อครูจาก SchoolOS ไม่สำเร็จ — ตอนนี้เห็นเฉพาะครูที่ติ๊กไว้แล้ว ลองรีเฟรชหน้าอีกครั้งเพื่อเพิ่มรายชื่อ
        </div>
      )}

      <div className="card stack" style={{ gap: 12 }}>
        <div className="grid-2">
          <input
            className="form-input"
            type="search"
            placeholder="ค้นหาชื่อหรือรหัสครู"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="form-select" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">ทุกกลุ่มสาระ</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="text-sm">
            ติ๊กแล้ว <strong>{picked.size}</strong> คน
            {savedAt && <span className="muted"> · บันทึกล่าสุด {savedAt}</span>}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="form-check" style={{ margin: 0 }}>
              <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />
              <span>เฉพาะที่ติ๊ก</span>
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown(true)} disabled={!shown.length}>
              ติ๊กทั้งหมดที่แสดง
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown(false)} disabled={!shown.length}>
              ล้างที่แสดง
            </button>
          </div>
        </div>
      </div>

      {shown.length ? (
        <div className="table-wrap table-cards">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>เข้าร่วม</th>
                <th>ชื่อ - นามสกุล</th>
                <th>กลุ่มสาระ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const on = picked.has(t.code);
                return (
                  <tr key={t.code}>
                    <td data-label="เข้าร่วม">
                      <label className="form-check" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(ev) => toggle(t.code, ev.target.checked)}
                          aria-label={`เข้าร่วม: ${t.name}`}
                        />
                        <span className={on ? "" : "muted"}>{on ? "เข้าร่วม" : "—"}</span>
                      </label>
                    </td>
                    <td className="td-title" style={on ? undefined : { opacity: 0.7 }}>
                      {t.name}
                      <span className="muted text-sm"> · {t.code}</span>
                      {t.inactive && (
                        <span className="badge" style={{ marginLeft: 6 }}>ไม่อยู่ในรายชื่อปัจจุบัน</span>
                      )}
                    </td>
                    <td className="text-sm" data-label="กลุ่มสาระ">
                      {t.group || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state card">
          <Icon name="user" size={44} className="empty-ico" />
          <p>{teachers.length ? "ไม่พบครูตามที่ค้นหา" : "ไม่มีรายชื่อครู"}</p>
        </div>
      )}

      <div className="form-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "กำลังบันทึก…" : `บันทึกรายชื่อ (${picked.size} คน)`}
        </button>
      </div>
      <p className="form-hint">
        ติ๊กเพิ่ม/เอาติ๊กออกได้ตลอด แต่ต้องกด “บันทึกรายชื่อ” ทุกครั้งจึงจะมีผล
        <br />
        ถ้าออกเกียรติบัตรไปแล้วแล้วมาเอาติ๊กออกทีหลัง ใบที่ออกไปแล้วจะไม่หายไปเอง —
        ต้องแจ้งผู้ดูแลระบบให้ยกเลิกการออกเกียรติบัตรของรายการนี้ แล้วออกใหม่
      </p>
    </div>
  );
}
