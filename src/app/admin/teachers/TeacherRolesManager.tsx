"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Role = { teacherCode: string; name: string; isAdmin: boolean; isRecorder: boolean };
type ApiTeacher = { teacherCode: string; name: string; subjectGroup: string };

export function TeacherRolesManager({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [apiTeachers, setApiTeachers] = useState<ApiTeacher[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  async function setRole(teacherCode: string, name: string, isAdmin: boolean, isRecorder: boolean) {
    setBusy(true); setMsg(null);
    const res = await api.post("/api/admin/teachers/role", { teacherCode, name, isAdmin, isRecorder });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setMsg({ type: "success", text: "บันทึกสิทธิ์เรียบร้อยแล้ว" });
    router.refresh();
  }

  async function loadTeachers() {
    setLoadingList(true); setMsg(null);
    const res = await api.get<{ teachers: ApiTeacher[] }>("/api/admin/teachers");
    setLoadingList(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setApiTeachers(res.data.teachers);
  }

  const roleMap = new Map(roles.map((r) => [r.teacherCode, r]));
  const filtered = (apiTeachers ?? []).filter(
    (t) => !search || t.name.includes(search) || t.teacherCode.includes(search)
  );

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card mb-4">
        <div className="card-header" style={{ padding: 0, border: "none", marginBottom: 12 }}>ครูที่มีสิทธิ์พิเศษ</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>รหัสครู</th><th>ชื่อ</th><th>Admin</th><th>ผู้บันทึกผล</th><th></th></tr></thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.teacherCode}>
                  <td>{r.teacherCode}</td>
                  <td>{r.name || "-"}</td>
                  <td>{r.isAdmin ? <span className="badge badge-purple">Admin</span> : "-"}</td>
                  <td>{r.isRecorder ? <span className="badge badge-info">Recorder</span> : "-"}</td>
                  <td className="num">
                    <button className="btn btn-danger btn-sm" disabled={busy}
                      onClick={() => setRole(r.teacherCode, r.name, false, false)}>ยกเลิกสิทธิ์</button>
                  </td>
                </tr>
              ))}
              {!roles.length && <tr><td colSpan={5} className="text-center muted">ยังไม่มีการมอบสิทธิ์</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="row between mb-4">
          <div className="card-header" style={{ padding: 0, border: "none" }}>มอบสิทธิ์จากรายชื่อครู</div>
          <button className="btn btn-secondary btn-sm" onClick={loadTeachers} disabled={loadingList}>
            {loadingList ? "กำลังโหลด…" : apiTeachers ? "โหลดใหม่" : "โหลดรายชื่อครูจาก Teacher API"}
          </button>
        </div>

        {apiTeachers && (
          <>
            <input className="form-input mb-4" style={{ maxWidth: 320 }} placeholder="ค้นหาชื่อ/รหัสครู" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>รหัสครู</th><th>ชื่อ</th><th>หมวด</th><th>Admin</th><th>Recorder</th></tr></thead>
                <tbody>
                  {filtered.slice(0, 100).map((t) => {
                    const cur = roleMap.get(t.teacherCode);
                    const isAdmin = cur?.isAdmin ?? false;
                    const isRecorder = cur?.isRecorder ?? false;
                    return (
                      <tr key={t.teacherCode}>
                        <td>{t.teacherCode}</td>
                        <td>{t.name}</td>
                        <td className="text-sm muted">{t.subjectGroup}</td>
                        <td>
                          <input type="checkbox" checked={isAdmin} disabled={busy}
                            onChange={(e) => setRole(t.teacherCode, t.name, e.target.checked, isRecorder)} />
                        </td>
                        <td>
                          <input type="checkbox" checked={isRecorder} disabled={busy}
                            onChange={(e) => setRole(t.teacherCode, t.name, isAdmin, e.target.checked)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="form-hint mt-2">แสดงสูงสุด 100 รายการ · ใช้ช่องค้นหาเพื่อกรอง</div>
          </>
        )}
      </div>
    </>
  );
}
