"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { CLASS_LEVELS, formatThaiDate, type RoomStudent } from "@/lib/domain";
import { useClassRooms } from "@/lib/useClassRooms";

type Resp = { students: RoomStudent[]; yearBe: number | null };

/** ดูรายชื่อนักเรียนทีละห้อง พร้อมรายการแข่งขันที่แต่ละคนสมัครไว้ — ครูทุกคนและ admin ดูได้ */
export function ClassRegistrations() {
  const [level, setLevel] = useState("");
  const [room, setRoom] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const { rooms, loading: roomsLoading } = useClassRooms(level);

  // เปลี่ยนระดับชั้น → ล้างห้องและผลเดิม
  useEffect(() => {
    setRoom("");
    setData(null);
  }, [level]);

  async function load(nextRoom: string) {
    setRoom(nextRoom);
    setData(null);
    setErr("");
    if (!nextRoom) return;
    setBusy(true);
    const sp = new URLSearchParams({ class_level: level, class_room: nextRoom });
    const res = await api.get<Resp>(`/api/registrations/by-room?${sp.toString()}`);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setData(res.data);
  }

  const students = data?.students ?? [];
  const registeredCount = students.filter((s) => s.registrations.length > 0).length;
  const registeredPct = students.length ? Math.round((registeredCount / students.length) * 100) : 0;

  return (
    <div className="stack">
      <div className="card">
        <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
          <div className="form-group" style={{ marginBottom: 0, width: 140 }}>
            <label className="form-label">ระดับชั้น</label>
            <select className="form-select" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">— เลือกระดับชั้น —</option>
              {CLASS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, width: 140 }}>
            <label className="form-label">ห้อง</label>
            <select className="form-select" value={room} onChange={(e) => load(e.target.value)} disabled={!level || !rooms.length}>
              <option value="">{roomsLoading ? "กำลังโหลด…" : "— เลือกห้อง —"}</option>
              {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {busy && <div className="muted text-sm" style={{ paddingBottom: 10 }}>กำลังโหลดรายชื่อ…</div>}
        </div>
        {err && <div className="form-error mt-2">{err}</div>}
      </div>

      {!data && !busy && (
        <div className="empty-state card">
          <Icon name="graduation" size={44} className="empty-ico" />
          <p>เลือกระดับชั้นและห้องเพื่อดูรายชื่อนักเรียน</p>
          <p className="text-sm">จะแสดงว่านักเรียนแต่ละคนสมัครกิจกรรมอะไรไปแล้วบ้าง</p>
        </div>
      )}

      {data && (
        <div className="card">
          <div className="row between mb-2">
            <div className="muted text-sm">
              {level}/{room} · {students.length} คน · สมัครแล้ว {registeredCount} คน ({registeredPct}%) · ยังไม่สมัคร {students.length - registeredCount} คน
            </div>
            {data.yearBe && <span className="badge badge-purple">ปีการศึกษา {data.yearBe}</span>}
          </div>
          {students.length > 0 && (
            <div className="row mb-4" style={{ gap: 10, alignItems: "center" }}>
              <div
                role="progressbar"
                aria-valuenow={registeredPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="สัดส่วนนักเรียนที่สมัครแล้ว"
                style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--skdw-bg, #eee)", overflow: "hidden" }}
              >
                <div
                  style={{
                    width: `${registeredPct}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: registeredPct >= 100 ? "var(--skdw-green, #16a34a)" : "var(--skdw-purple, #7c3aed)",
                    transition: "width .3s ease",
                  }}
                />
              </div>
              <span className="text-sm" style={{ fontWeight: 600, minWidth: 42, textAlign: "right" }}>{registeredPct}%</span>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>ลำดับ</th>
                  <th style={{ width: 120 }}>รหัสนักเรียน</th>
                  <th>ชื่อ-สกุล</th>
                  <th className="num" style={{ width: 70 }}>จำนวน</th>
                  <th>รายการที่สมัคร</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s.studentCode}>
                    <td>{i + 1}</td>
                    <td>{s.studentCode}</td>
                    <td>{s.name}</td>
                    <td className="num">{s.registrations.length || ""}</td>
                    <td>
                      {!s.registrations.length ? (
                        <span className="muted text-sm">ยังไม่ได้สมัคร</span>
                      ) : (
                        <div className="stack" style={{ gap: 4 }}>
                          {s.registrations.map((r) => (
                            <div key={r.entryId} className="text-sm">
                              <span className="badge badge-purple">{r.groupName}</span>{" "}
                              {r.competitionName}
                              {r.teamName && <span className="muted"> · ทีม {r.teamName}</span>}
                              {r.eventDate && <span className="muted"> · {formatThaiDate(r.eventDate)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!students.length && <tr><td colSpan={5} className="text-center muted">ไม่พบนักเรียนในห้องนี้</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
