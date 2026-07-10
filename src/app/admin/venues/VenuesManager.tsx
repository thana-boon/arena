"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";

type Venue = { id: number; name: string; building: string; note: string };

const EMPTY = { name: "", building: "", note: "" };

export function VenuesManager({ venues }: { venues: Venue[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState(EMPTY);

  async function add() {
    if (!form.name.trim()) return setMsg({ type: "error", text: "กรุณากรอกชื่อสถานที่" });
    setBusy(true); setMsg(null);
    const res = await api.post("/api/admin/venues", form);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setForm(EMPTY);
    router.refresh();
  }

  function startEdit(v: Venue) {
    setEditId(v.id);
    setEdit({ name: v.name, building: v.building, note: v.note });
    setMsg(null);
  }

  async function saveEdit(id: number) {
    if (!edit.name.trim()) return setMsg({ type: "error", text: "กรุณากรอกชื่อสถานที่" });
    setBusy(true); setMsg(null);
    const res = await api.patch(`/api/admin/venues/${id}`, edit);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setEditId(null);
    router.refresh();
  }

  async function del(v: Venue) {
    const ok = await confirm({
      title: "ลบสถานที่",
      message: `ยืนยันลบสถานที่ "${v.name}"?`,
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setMsg(null);
    const res = await api.del(`/api/admin/venues/${v.id}`);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.refresh();
  }

  function downloadTemplate() {
    const csv = "﻿ชื่อสถานที่,อาคาร,หมายเหตุ\nห้อง 301,อาคาร 3,\nห้องประชุมใหญ่,อาคารอำนวยการ,รองรับ 100 คน\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "venues-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg(null);
    const csv = await file.text();
    const res = await api.post<{ created: number; updated: number; skipped: number }>(
      "/api/admin/venues/import",
      { csv }
    );
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    const { created, updated, skipped } = res.data;
    setMsg({ type: "success", text: `นำเข้าสำเร็จ: เพิ่มใหม่ ${created} · อัปเดต ${updated} · ข้าม ${skipped}` });
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
                <th>ชื่อสถานที่</th>
                <th style={{ width: 200 }}>อาคาร</th>
                <th>หมายเหตุ</th>
                <th style={{ width: 180 }}></th>
              </tr>
            </thead>
            <tbody>
              {venues.map((v) =>
                editId === v.id ? (
                  <tr key={v.id}>
                    <td>
                      <input className="form-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    </td>
                    <td>
                      <input className="form-input" value={edit.building} onChange={(e) => setEdit({ ...edit, building: e.target.value })} />
                    </td>
                    <td>
                      <input className="form-input" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
                    </td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(v.id)} disabled={busy}>บันทึก</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)} disabled={busy}>ยกเลิก</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 500 }}>{v.name}</td>
                    <td>{v.building || <span className="muted">—</span>}</td>
                    <td>{v.note || <span className="muted">—</span>}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => startEdit(v)} disabled={busy}>แก้ไข</button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(v)} disabled={busy}>ลบ</button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {!venues.length && (
                <tr><td colSpan={4} className="text-center muted">ยังไม่มีสถานที่ — เพิ่มด้านล่างหรืออัปโหลด CSV</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header" style={{ padding: 0, border: "none", marginBottom: 16 }}>เพิ่มสถานที่ใหม่</div>
        <div className="row" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0, flex: "1 1 220px" }}>
            <label className="form-label">ชื่อสถานที่</label>
            <input className="form-input" placeholder="เช่น ห้อง 301" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <label className="form-label">อาคาร</label>
            <input className="form-input" placeholder="เช่น อาคาร 3" value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: "1 1 160px" }}>
            <label className="form-label">หมายเหตุ</label>
            <input className="form-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={add} disabled={busy}>
            <Icon name="plus" size={18} /> เพิ่มสถานที่
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ padding: 0, border: "none", marginBottom: 16 }}>นำเข้าจากไฟล์ CSV</div>
        <p className="form-hint" style={{ marginBottom: 12 }}>
          คอลัมน์: <b>ชื่อสถานที่, อาคาร, หมายเหตุ</b> (แถวแรกเป็นหัวตาราง) · ระบบจะเพิ่มใหม่หรืออัปเดตตามชื่อสถานที่
        </p>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={downloadTemplate} disabled={busy}>
            <Icon name="download" size={18} /> ดาวน์โหลดเทมเพลต
          </button>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="package" size={18} /> เลือกไฟล์ CSV เพื่อนำเข้า
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        </div>
      </div>
    </>
  );
}
