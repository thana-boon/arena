"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { CLASS_LEVELS } from "@/lib/domain";
import { useClassRooms } from "@/lib/useClassRooms";

type Row = { studentCode: string; name: string; classLevel: string; classRoom: string };
type Resp = { students: Row[]; total: number; page: number; limit: number };

export function StudentsBrowser() {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [room, setRoom] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ห้องดึงจาก Student API ตามระดับที่เลือก — เลือก "ทั้งหมด" (ระดับ) แล้วห้องจะปิดไว้
  const { rooms } = useClassRooms(level);
  useEffect(() => {
    setRoom("");
  }, [level]);

  async function load(page = 1) {
    setBusy(true); setErr("");
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (level) sp.set("class_level", level);
    if (room) sp.set("class_room", room);
    sp.set("page", String(page));
    const res = await api.get<Resp>(`/api/admin/students?${sp.toString()}`);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setData(res.data);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    load(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="stack">
      <div className="card">
        <form onSubmit={submit} className="row" style={{ alignItems: "flex-end", gap: 8 }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
            <label className="form-label">ค้นหาชื่อ/รหัส</label>
            <input className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ หรือ รหัสนักเรียน" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
            <label className="form-label">ระดับชั้น</label>
            <select className="form-select" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {CLASS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
            <label className="form-label">ห้อง</label>
            <select className="form-select" value={room} onChange={(e) => setRoom(e.target.value)} disabled={!level || !rooms.length}>
              <option value="">ทั้งหมด</option>
              {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "…" : "ค้นหา"}</button>
        </form>
        {err && <div className="form-error mt-2">{err}</div>}
      </div>

      {data && (
        <div className="card">
          <div className="row between mb-4">
            <div className="muted text-sm">พบ {data.total.toLocaleString("th-TH")} คน · หน้า {data.page}/{totalPages}</div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>รหัสนักเรียน</th><th>ชื่อ-สกุล</th><th>ระดับชั้น</th><th>ห้อง</th></tr></thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.studentCode}>
                    <td>{s.studentCode}</td>
                    <td>{s.name}</td>
                    <td>{s.classLevel}</td>
                    <td>{s.classRoom}</td>
                  </tr>
                ))}
                {!data.students.length && <tr><td colSpan={4} className="text-center muted">ไม่พบนักเรียน</td></tr>}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="row between mt-4">
              <button className="btn btn-secondary btn-sm" disabled={busy || data.page <= 1} onClick={() => load(data.page - 1)}>← ก่อนหน้า</button>
              <button className="btn btn-secondary btn-sm" disabled={busy || data.page >= totalPages} onClick={() => load(data.page + 1)}>ถัดไป →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
