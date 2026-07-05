"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { CLASS_LEVELS } from "@/lib/domain";
import { useClassRooms } from "@/lib/useClassRooms";

export type PickedStudent = { studentCode: string; name: string; classLevel: string; classRoom: string };

export function StudentPicker({
  onPick,
  excludeCodes = [],
  levels,
}: {
  onPick: (s: PickedStudent) => void;
  excludeCodes?: string[];
  /** จำกัดระดับชั้นที่เลือกได้ (เช่น ระดับที่รายการแข่งขันเปิดรับ) — ไม่ส่ง = ทั้งหมด */
  levels?: string[];
}) {
  const levelOptions = levels && levels.length ? levels : (CLASS_LEVELS as readonly string[]);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState(levelOptions.length === 1 ? levelOptions[0] : "");
  const [room, setRoom] = useState("");
  const [results, setResults] = useState<PickedStudent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // รายชื่อห้องดึงจาก Student API โดยตรง (ครบทุกห้อง ไม่ขึ้นกับผลค้นหาที่ถูกตัดที่ 50)
  const { rooms } = useClassRooms(level);

  // เปลี่ยนระดับ → ล้างห้องที่เลือกไว้ (ห้องของระดับเดิมอาจไม่มีในระดับใหม่)
  useEffect(() => {
    setRoom("");
  }, [level]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (level) sp.set("class_level", level);
    if (room) sp.set("class_room", room);
    const res = await api.get<{ students: PickedStudent[] }>(`/api/students/search?${sp.toString()}`);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setResults(res.data.students);
  }

  const shown = (results ?? []).filter((s) => !excludeCodes.includes(s.studentCode));

  return (
    <div className="stack" style={{ gap: 8 }}>
      <form onSubmit={search} className="row" style={{ alignItems: "flex-end", gap: 8 }}>
        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
          <label className="form-label">ค้นหาชื่อ/รหัส</label>
          <input className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ หรือ รหัสนักเรียน" />
        </div>
        <div className="form-group" style={{ marginBottom: 0, width: 90 }}>
          <label className="form-label">ระดับ</label>
          <select className="form-select" value={level} onChange={(e) => setLevel(e.target.value)}>
            {levelOptions.length !== 1 && <option value="">ทั้งหมด</option>}
            {levelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
          <label className="form-label">ห้อง</label>
          <select className="form-select" value={room} onChange={(e) => setRoom(e.target.value)} disabled={!level || !rooms.length}>
            <option value="">ทั้งหมด</option>
            {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary" disabled={busy}>{busy ? "…" : "ค้นหา"}</button>
      </form>
      {err && <div className="form-error">{err}</div>}
      {results && (
        <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
          <table className="table">
            <tbody>
              {shown.map((s) => (
                <tr key={s.studentCode}>
                  <td>{s.name}</td>
                  <td className="text-sm muted">{s.classLevel}/{s.classRoom}</td>
                  <td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => onPick(s)}>เพิ่ม</button></td>
                </tr>
              ))}
              {!shown.length && <tr><td className="muted text-center">ไม่พบนักเรียน</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
