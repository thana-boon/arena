"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import type { RosterEntry } from "@/lib/roster";

export function RosterManager({
  competitionId,
  type,
  teamSizeMin,
  teamSizeMax,
  roster,
  canOverride,
  allowedLevels,
}: {
  competitionId: number;
  type: "individual" | "team";
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  roster: RosterEntry[];
  canOverride: boolean;
  allowedLevels: string[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [members, setMembers] = useState<PickedStudent[]>([]);
  const [teamName, setTeamName] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  async function submit() {
    setBusy(true); setMsg(null);
    const res = await api.post("/api/registrations", {
      competitionId,
      teamName: type === "team" ? teamName || null : null,
      memberCodes: members.map((m) => m.studentCode),
      override: canOverride ? override : undefined,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setAdding(false); setMembers([]); setTeamName(""); setOverride(false);
    router.refresh();
  }

  async function withdraw(entryId: number) {
    const ok = await confirm({
      title: "ยกเลิกการลงทะเบียน",
      message: "ยืนยันยกเลิกการลงทะเบียนนี้?",
      confirmText: "ยกเลิกการลงทะเบียน",
      cancelText: "ไม่",
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setMsg(null);
    const res = await api.del(`/api/registrations/${entryId}`);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.refresh();
  }

  const maxMembers = type === "team" ? teamSizeMax ?? 99 : 1;
  const minMembers = type === "team" ? teamSizeMin ?? 1 : 1;

  return (
    <div className="card">
      <div className="row between mb-4">
        <div className="card-header" style={{ padding: 0, border: "none" }}>
          รายชื่อผู้ลงทะเบียน ({roster.length})
        </div>
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ เพิ่มผู้เข้าแข่งขัน</button>}
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {adding && (
        <div className="card mb-4" style={{ background: "var(--skdw-bg)" }}>
          {type === "team" && (
            <div className="form-group">
              <label className="form-label">ชื่อทีม (ถ้ามี)</label>
              <input className="form-input" style={{ maxWidth: 320 }} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            </div>
          )}
          <label className="form-label">สมาชิก ({members.length}/{maxMembers})</label>
          <div className="stack" style={{ gap: 6 }}>
            {members.map((m) => (
              <div key={m.studentCode} className="row between" style={{ background: "#fff", padding: "6px 12px", borderRadius: 6 }}>
                <span>{m.name} <span className="muted text-sm">({m.classLevel}/{m.classRoom})</span></span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMembers(members.filter((x) => x.studentCode !== m.studentCode))}>ออก</button>
              </div>
            ))}
          </div>
          {members.length < maxMembers && (
            <div className="mt-4">
              <StudentPicker excludeCodes={members.map((m) => m.studentCode)} levels={allowedLevels}
                onPick={(s) => setMembers((prev) => (prev.some((x) => x.studentCode === s.studentCode) ? prev : [...prev, s]))} />
            </div>
          )}
          {canOverride && (
            <label className="form-check mt-4">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span>ลงทะเบียนแบบ override (ข้ามกติกาปิดรับ/จำนวน/เวลาชน — จะถูกบันทึก log)</span>
            </label>
          )}
          <div className="row mt-4">
            <button className="btn btn-primary" disabled={busy || members.length < minMembers} onClick={submit}>
              {busy ? "กำลังบันทึก…" : "ยืนยันลงทะเบียน"}
            </button>
            <button className="btn btn-ghost" onClick={() => { setAdding(false); setMembers([]); }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {!roster.length ? (
        <div className="empty-state"><div className="big">📋</div><p>ยังไม่มีผู้ลงทะเบียน</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th style={{ width: 50 }}>#</th>{type === "team" && <th>ทีม</th>}<th>สมาชิก</th><th></th></tr>
            </thead>
            <tbody>
              {roster.map((e, i) => (
                <tr key={e.entryId}>
                  <td>{i + 1}</td>
                  {type === "team" && <td>{e.teamName || "-"}</td>}
                  <td>{e.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}</td>
                  <td className="num"><button className="btn btn-danger btn-sm" disabled={busy} onClick={() => withdraw(e.entryId)}>ยกเลิก</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
