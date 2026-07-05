"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { formatThaiDate } from "@/lib/domain";

export type BrowseComp = {
  id: number;
  name: string;
  type: "individual" | "team";
  subjectGroupId: number;
  groupName: string;
  levels: string[];
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number;
  registered: number;
  alreadyRegistered: boolean;
  myEntryId: number | null;
};

export function BrowseRegister({
  comps,
  registrationOpen,
  self,
}: {
  comps: BrowseComp[];
  registrationOpen: boolean;
  self: PickedStudent;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [openTeam, setOpenTeam] = useState<number | null>(null);
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<PickedStudent[]>([self]);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: number; type: string; text: string } | null>(null);
  // เลือกหมวดก่อน แล้วค่อยแสดงรายการของหมวดนั้น (ลดภาระเวลารายการเยอะ)
  const [groupId, setGroupId] = useState<number | null>(null);

  // สรุปหมวด: จำนวนรายการ + จำนวนที่ลงทะเบียนแล้ว ในแต่ละหมวด
  const groups = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number; registered: number }>();
    for (const c of comps) {
      const g = map.get(c.subjectGroupId) ?? { id: c.subjectGroupId, name: c.groupName, count: 0, registered: 0 };
      g.count += 1;
      if (c.alreadyRegistered) g.registered += 1;
      map.set(c.subjectGroupId, g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [comps]);

  async function registerIndividual(c: BrowseComp) {
    const ok = await confirm({
      title: "ยืนยันการลงทะเบียน",
      message: `แน่ใจหรือไม่ว่าจะลงทะเบียนรายการ "${c.name}"?`,
      confirmText: "ลงทะเบียน",
    });
    if (!ok) return;
    setBusy(c.id); setMsg(null);
    const res = await api.post(`/api/registrations`, { competitionId: c.id, memberCodes: [self.studentCode] });
    setBusy(null);
    if (!res.ok) return setMsg({ id: c.id, type: "error", text: res.error });
    router.refresh();
  }

  async function cancelRegistration(c: BrowseComp) {
    if (c.myEntryId == null) return;
    const ok = await confirm({
      title: "ยกเลิกการลงทะเบียน",
      message: `ยืนยันยกเลิกการลงทะเบียนรายการ "${c.name}"?`,
      confirmText: "ยกเลิกการลงทะเบียน",
      cancelText: "ไม่",
      danger: true,
    });
    if (!ok) return;
    setBusy(c.id); setMsg(null);
    const res = await api.del(`/api/registrations/${c.myEntryId}`);
    setBusy(null);
    if (!res.ok) return setMsg({ id: c.id, type: "error", text: res.error });
    router.refresh();
  }

  function openTeamForm(c: BrowseComp) {
    setOpenTeam(c.id);
    setTeamName("");
    setMembers([self]);
    setMsg(null);
  }

  async function submitTeam(c: BrowseComp) {
    const ok = await confirm({
      title: "ยืนยันการลงทะเบียนทีม",
      message: `แน่ใจหรือไม่ว่าจะลงทะเบียนทีมในรายการ "${c.name}" (${members.length} คน)?`,
      confirmText: "ลงทะเบียน",
    });
    if (!ok) return;
    setBusy(c.id); setMsg(null);
    const res = await api.post(`/api/registrations`, {
      competitionId: c.id,
      teamName: teamName || null,
      memberCodes: members.map((m) => m.studentCode),
    });
    setBusy(null);
    if (!res.ok) return setMsg({ id: c.id, type: "error", text: res.error });
    setOpenTeam(null);
    router.refresh();
  }

  if (!comps.length) {
    return (
      <div className="empty-state card">
        <div className="big">🔍</div>
        <p>ยังไม่มีรายการแข่งขันที่เปิดรับระดับชั้นของคุณ</p>
      </div>
    );
  }

  // ขั้นที่ 1: ยังไม่เลือกหมวด → แสดงการ์ดหมวดให้เลือก
  if (groupId == null) {
    return (
      <div className="stack">
        <div className="text-sm muted">เลือกหมวดวิชาที่ต้องการก่อน แล้วจึงเลือกรายการแข่งขัน</div>
        <div className="grid-3 stagger">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className="card"
              style={{ textAlign: "left", cursor: "pointer", border: "0.5px solid var(--skdw-border)" }}
              onClick={() => { setGroupId(g.id); setMsg(null); }}
            >
              <div className="row between mb-2">
                <span className="badge badge-purple">📚 หมวดวิชา</span>
                {g.registered > 0 && <span className="badge badge-success">ลงแล้ว {g.registered}</span>}
              </div>
              <h3 style={{ margin: "4px 0" }}>{g.name}</h3>
              <div className="text-sm muted">{g.count} รายการ</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ขั้นที่ 2: เลือกหมวดแล้ว → แสดงเฉพาะรายการของหมวดนั้น
  const shownComps = comps.filter((c) => c.subjectGroupId === groupId);
  const currentGroupName = groups.find((g) => g.id === groupId)?.name ?? "";

  return (
    <div className="stack">
      <div className="row between">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setGroupId(null); setMsg(null); }}>
          ← เลือกหมวดอื่น
        </button>
        <span className="badge badge-purple">📚 {currentGroupName}</span>
      </div>
      {shownComps.map((c) => {
        const full = c.registered >= c.capacity;
        const canRegister = registrationOpen && !c.alreadyRegistered && !full;
        return (
          <div key={c.id} className="card">
            <div className="row between">
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="badge badge-purple">{c.groupName}</span>
                  <span className="badge">{c.type === "team" ? `ทีม ${c.teamSizeMin}-${c.teamSizeMax} คน` : "เดี่ยว"}</span>
                </div>
                <h3 style={{ margin: "8px 0 4px" }}>{c.name}</h3>
                <div className="text-sm muted">
                  ที่นั่ง {c.registered}/{c.capacity}
                  {c.eventDate && ` · ${formatThaiDate(c.eventDate)} ${c.startTime?.slice(0, 5)}–${c.endTime?.slice(0, 5)}`}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {c.alreadyRegistered ? (
                  <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                    <span className="badge badge-success">ลงทะเบียนแล้ว</span>
                    {registrationOpen && c.myEntryId != null && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === c.id}
                        onClick={() => cancelRegistration(c)}
                      >
                        {busy === c.id ? "…" : "ยกเลิกการลงทะเบียน"}
                      </button>
                    )}
                  </div>
                ) : full ? (
                  <span className="badge badge-error">เต็ม</span>
                ) : c.type === "individual" ? (
                  <button className="btn btn-primary btn-sm" disabled={!canRegister || busy === c.id} onClick={() => registerIndividual(c)}>
                    {busy === c.id ? "…" : "ลงทะเบียน"}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={!canRegister} onClick={() => openTeamForm(c)}>
                    ลงทะเบียนทีม
                  </button>
                )}
              </div>
            </div>

            {msg?.id === c.id && <div className={`alert alert-${msg.type} mt-4`}>{msg.text}</div>}

            {openTeam === c.id && c.type === "team" && (
              <div className="mt-4" style={{ borderTop: "0.5px solid var(--skdw-border)", paddingTop: 16 }}>
                <div className="form-group">
                  <label className="form-label">ชื่อทีม (ถ้ามี)</label>
                  <input className="form-input" style={{ maxWidth: 320 }} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="เช่น ทีมดาวรุ่ง" />
                </div>
                <label className="form-label">สมาชิกในทีม ({members.length}/{c.teamSizeMax})</label>
                <div className="stack" style={{ gap: 6 }}>
                  {members.map((m) => (
                    <div key={m.studentCode} className="row between" style={{ background: "var(--skdw-bg)", padding: "6px 12px", borderRadius: 6 }}>
                      <span>{m.name} <span className="muted text-sm">({m.classLevel}/{m.classRoom})</span></span>
                      {m.studentCode === self.studentCode ? (
                        <span className="badge badge-purple">คุณ</span>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMembers(members.filter((x) => x.studentCode !== m.studentCode))}>ออก</button>
                      )}
                    </div>
                  ))}
                </div>
                {members.length < (c.teamSizeMax ?? 99) && (
                  <div className="mt-4">
                    <StudentPicker
                      excludeCodes={members.map((m) => m.studentCode)}
                      onPick={(s) => setMembers((prev) => (prev.some((x) => x.studentCode === s.studentCode) ? prev : [...prev, s]))}
                    />
                  </div>
                )}
                <div className="row mt-4">
                  <button className="btn btn-primary" disabled={busy === c.id || members.length < (c.teamSizeMin ?? 1)} onClick={() => submitTeam(c)}>
                    {busy === c.id ? "กำลังลงทะเบียน…" : "ยืนยันลงทะเบียนทีม"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setOpenTeam(null)}>ยกเลิก</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
