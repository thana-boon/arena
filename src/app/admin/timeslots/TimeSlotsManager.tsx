"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { ThaiTimePicker } from "@/components/ThaiTimePicker";
import { hhmm } from "@/lib/domain";

type Slot = { id: number; label: string; startTime: string; endTime: string };

const EMPTY = { label: "", startTime: "09:00", endTime: "12:00" };

/** ตรวจซ้ำฝั่ง client เพื่อเตือนทันที (server ตรวจอีกชั้นด้วย slotInput) */
function timeError(v: { startTime: string; endTime: string }): string {
  return v.startTime < v.endTime ? "" : "เวลาเริ่มต้องก่อนเวลาสิ้นสุด";
}

export function TimeSlotsManager({ slots }: { slots: Slot[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  // แก้ไข inline: เก็บ id ที่กำลังแก้ + ค่า
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState(EMPTY);

  async function add() {
    if (!form.label.trim()) return setMsg({ type: "error", text: "กรุณากรอกชื่อช่วงเวลา" });
    const bad = timeError(form);
    if (bad) return setMsg({ type: "error", text: bad });
    setBusy(true); setMsg(null);
    const res = await api.post("/api/admin/timeslots", form);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setForm(EMPTY);
    router.refresh();
  }

  function startEdit(s: Slot) {
    setEditId(s.id);
    setEdit({ label: s.label, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime) });
    setMsg(null);
  }

  async function saveEdit(id: number) {
    if (!edit.label.trim()) return setMsg({ type: "error", text: "กรุณากรอกชื่อช่วงเวลา" });
    const bad = timeError(edit);
    if (bad) return setMsg({ type: "error", text: bad });
    setBusy(true); setMsg(null);
    const res = await api.patch(`/api/admin/timeslots/${id}`, edit);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setEditId(null);
    router.refresh();
  }

  async function del(s: Slot) {
    const ok = await confirm({
      title: "ลบช่วงเวลา",
      message: `ยืนยันลบช่วงเวลา "${s.label}"?`,
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setMsg(null);
    const res = await api.del(`/api/admin/timeslots/${s.id}`);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.refresh();
  }

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card mb-4">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ชื่อช่วงเวลา</th>
                <th style={{ width: 170 }}>เริ่ม</th>
                <th style={{ width: 170 }}>ถึง</th>
                <th style={{ width: 180 }}></th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s) =>
                editId === s.id ? (
                  <tr key={s.id}>
                    <td>
                      <input className="form-input" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
                    </td>
                    <td>
                      <ThaiTimePicker label="เริ่ม" value={edit.startTime} onChange={(v) => setEdit({ ...edit, startTime: v })} />
                    </td>
                    <td>
                      <ThaiTimePicker label="ถึง" value={edit.endTime} onChange={(v) => setEdit({ ...edit, endTime: v })} />
                    </td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(s.id)} disabled={busy}>บันทึก</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)} disabled={busy}>ยกเลิก</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.label}</td>
                    <td className="num">{hhmm(s.startTime)}</td>
                    <td className="num">{hhmm(s.endTime)}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => startEdit(s)} disabled={busy}>แก้ไข</button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(s)} disabled={busy}>ลบ</button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {!slots.length && (
                <tr><td colSpan={4} className="text-center muted">ยังไม่มีช่วงเวลา — เพิ่มด้านล่าง</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ padding: 0, border: "none", marginBottom: 16 }}>เพิ่มช่วงเวลาใหม่</div>
        <div className="row" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0, flex: "1 1 220px" }}>
            <label className="form-label">ชื่อช่วงเวลา</label>
            <input className="form-input" placeholder="เช่น ช่วงเช้า" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">เริ่ม</label>
            <ThaiTimePicker label="เริ่ม" value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">ถึง</label>
            <ThaiTimePicker label="ถึง" value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} />
          </div>
          <button className="btn btn-primary" onClick={add} disabled={busy}>
            <Icon name="plus" size={18} /> เพิ่มช่วงเวลา
          </button>
        </div>
      </div>
    </>
  );
}
