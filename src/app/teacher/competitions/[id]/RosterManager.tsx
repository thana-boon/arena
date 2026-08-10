"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
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
  allowCrossClass,
  regClosedReason,
  hasEvent,
}: {
  competitionId: number;
  type: "individual" | "team";
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  roster: RosterEntry[];
  canOverride: boolean;
  allowedLevels: string[];
  /** ทีมข้ามห้องได้หรือไม่ — false = สมาชิกคนถัดไปถูกล็อกให้อยู่ห้องเดียวกับคนแรก */
  allowCrossClass: boolean;
  /** เหตุผลที่ตอนนี้ยังลงทะเบียนไม่ได้ (ปิดรับ/ยังไม่เปิด/หมดเวลา) — null = อยู่ในช่วงรับสมัคร */
  regClosedReason: string | null;
  /** รายการนี้ถูกจัดเข้างานแล้วหรือยัง — ยังไม่เข้างาน = ลงไม่ได้เลย ต้องแก้ที่ตัวรายการก่อน */
  hasEvent: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [members, setMembers] = useState<PickedStudent[]>([]);
  const [teamName, setTeamName] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  // รายการเดี่ยว = เลือกได้หลายคนพร้อมกัน แล้วบันทึกเป็นคนละใบสมัคร (1 คน = 1 entry)
  const bulk = type === "individual";

  function reset() {
    setAdding(false); setMembers([]); setTeamName(""); setOverride(false);
  }

  async function submitTeam() {
    setBusy(true); setMsg(null);
    const res = await api.post("/api/registrations", {
      competitionId,
      teamName: teamName || null,
      memberCodes: members.map((m) => m.studentCode),
      override: canOverride ? override : undefined,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    reset();
    router.refresh();
  }

  /**
   * รายการเดี่ยวหลายคน — ยิงทีละคนตามลำดับ (ไม่ยิงขนาน) เพราะ server ตัดที่นั่ง
   * แบบ atomic ต่อ 1 entry อยู่แล้ว และอยากให้คนที่เลือกก่อนได้สิทธิ์ก่อนเมื่อที่นั่งใกล้เต็ม
   */
  async function submitBulk() {
    setBusy(true); setMsg(null);
    const failed: { student: PickedStudent; error: string }[] = [];
    let success = 0;
    for (const [i, s] of members.entries()) {
      setProgress({ done: i, total: members.length });
      const res = await api.post("/api/registrations", {
        competitionId,
        teamName: null,
        memberCodes: [s.studentCode],
        override: canOverride ? override : undefined,
      });
      if (res.ok) success++;
      else failed.push({ student: s, error: res.error });
    }
    setProgress(null);
    setBusy(false);
    // คนที่ไม่ผ่านค้างไว้ในรายการ ครูจะได้เห็นว่าเหลือใคร แล้วเอาออก/แก้ทีละคนได้
    setMembers(failed.map((f) => f.student));
    if (!failed.length) reset();
    setMsg(
      failed.length
        ? {
            type: "error",
            text:
              `ลงทะเบียนสำเร็จ ${success} คน • ไม่สำเร็จ ${failed.length} คน — ` +
              failed.map((f) => `${f.student.name}: ${f.error}`).join(" | "),
          }
        : { type: "success", text: `ลงทะเบียนสำเร็จ ${success} คน` }
    );
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
  // คนที่ลงรายการนี้ไปแล้ว — ซ่อนจากช่องเลือก ไม่งั้น "เลือกทั้งห้อง" จะติ๊กคนเดิมซ้ำแล้วโดน server ปฏิเสธ
  const registeredCodes = roster.flatMap((e) => e.members.map((m) => m.studentCode));
  // ทีมห้ามข้ามห้อง: คนแรกเลือกได้อิสระ จากนั้นล็อกห้องตามคนแรก
  const roomLock =
    type === "team" && !allowCrossClass && members[0]
      ? { classLevel: members[0].classLevel, classRoom: members[0].classRoom }
      : null;

  // นอกช่วงรับสมัคร: admin ยังเพิ่มได้ตลอด (server ยกเว้นให้เฉพาะ role นี้) — ครูคนอื่นเพิ่มไม่ได้
  // ยกเว้นรายการที่ยังไม่เข้างาน ซึ่งลงไม่ได้ทุกคน จนกว่าจะแก้รายการให้สังกัดงานก่อน
  const canAdd = !regClosedReason || (canOverride && hasEvent);
  // ปิดรับสมัครแล้วก็ลบรายชื่อไม่ได้เหมือนกัน (เหลือแต่ admin) — server บังคับซ้ำอีกชั้น
  const canWithdraw = !regClosedReason || canOverride;

  return (
    <div className="card">
      <div className="row between mb-4">
        <div className="card-header" style={{ padding: 0, border: "none" }}>
          รายชื่อผู้ลงทะเบียน ({roster.length})
        </div>
        {!adding && canAdd && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ เพิ่มผู้เข้าแข่งขัน</button>
        )}
      </div>

      {regClosedReason && (
        <div className={`alert alert-${canAdd ? "info" : "warning"}`}>
          {!hasEvent
            ? "รายการนี้ยังไม่ถูกจัดเข้างาน — แก้ไขรายการให้สังกัดงานก่อน จึงจะลงทะเบียนผู้เข้าแข่งขันได้"
            : canAdd
              ? `${regClosedReason} — คุณเป็นผู้ดูแลระบบ จึงเพิ่ม/ยกเลิกผู้เข้าแข่งขันได้ตลอด (ระบบบันทึกไว้ใน log ว่าลงหลังปิดรับ)`
              : `${regClosedReason} — เพิ่มหรือยกเลิกผู้เข้าแข่งขันได้เฉพาะผู้ดูแลระบบ`}
        </div>
      )}

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {adding && (
        <div className="card mb-4" style={{ background: "var(--skdw-bg)" }}>
          {type === "team" && (
            <div className="form-group">
              <label className="form-label">ชื่อทีม (ถ้ามี)</label>
              <input className="form-input" style={{ maxWidth: 320 }} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            </div>
          )}
          <label className="form-label">
            {bulk ? `นักเรียนที่จะลงทะเบียน (${members.length} คน)` : `สมาชิก (${members.length}/${maxMembers})`}
          </label>
          {bulk && (
            <div className="form-hint" style={{ marginBottom: 8 }}>
              เลือกได้หลายคนพร้อมกัน — ระบบจะลงทะเบียนให้คนละ 1 รายการ (ใช้แท็บ “เลือกทั้งห้อง” เพื่อติ๊กทีละหลายคน)
            </div>
          )}
          {type === "team" && !allowCrossClass && !members.length && (
            <div className="form-hint" style={{ marginBottom: 8 }}>
              รายการนี้ไม่อนุญาตให้ทีมข้ามห้อง — เลือกสมาชิกคนแรกก่อน แล้วระบบจะให้เลือกได้เฉพาะเพื่อนห้องเดียวกัน
            </div>
          )}
          <div className="stack" style={{ gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {members.map((m) => (
              <div key={m.studentCode} className="row between" style={{ background: "#fff", padding: "6px 12px", borderRadius: 6 }}>
                <span>{m.name} <span className="muted text-sm">({m.classLevel}/{m.classRoom})</span></span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMembers(members.filter((x) => x.studentCode !== m.studentCode))}>ออก</button>
              </div>
            ))}
          </div>
          {(bulk || members.length < maxMembers) && (
            <div className="mt-4">
              <StudentPicker
                excludeCodes={[...registeredCodes, ...members.map((m) => m.studentCode)]}
                levels={allowedLevels}
                restrictRoom={roomLock}
                remaining={bulk ? undefined : maxMembers - members.length}
                onPick={(s) =>
                  setMembers((prev) =>
                    (!bulk && prev.length >= maxMembers) || prev.some((x) => x.studentCode === s.studentCode)
                      ? prev
                      : [...prev, s]
                  )
                }
              />
            </div>
          )}
          {canOverride && (
            <label className="form-check mt-4">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span>
                ลงทะเบียนแบบ override (ข้ามกติกาจำนวนรายการต่อคน/เวลาแข่งชน — จะถูกบันทึก log)
                {regClosedReason && " · ช่วงรับสมัครไม่ต้องติ๊กแล้ว ผู้ดูแลระบบข้ามให้อัตโนมัติ"}
              </span>
            </label>
          )}
          <div className="row mt-4">
            <button
              className="btn btn-primary"
              disabled={busy || members.length < minMembers}
              onClick={bulk ? submitBulk : submitTeam}
            >
              {busy
                ? progress
                  ? `กำลังบันทึก ${progress.done + 1}/${progress.total}…`
                  : "กำลังบันทึก…"
                : bulk && members.length > 1
                  ? `ยืนยันลงทะเบียน ${members.length} คน`
                  : "ยืนยันลงทะเบียน"}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => { setAdding(false); setMembers([]); }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {!roster.length ? (
        <div className="empty-state"><Icon name="clipboard" size={44} className="empty-ico" /><p>ยังไม่มีผู้ลงทะเบียน</p></div>
      ) : (
        <div className="table-wrap table-cards">
          <table className="table">
            <thead>
              <tr><th style={{ width: 50 }}>#</th>{type === "team" && <th>ทีม</th>}<th>สมาชิก</th><th></th></tr>
            </thead>
            <tbody>
              {roster.map((e, i) => (
                <tr key={e.entryId}>
                  <td className="hide-sm">{i + 1}</td>
                  {type === "team" && <td className="td-title">{e.teamName || `ทีมที่ ${i + 1}`}</td>}
                  <td className={type === "team" ? "td-block" : "td-title"} data-label={type === "team" ? "สมาชิก" : undefined}>
                    <span className="only-sm muted">{type === "team" ? "" : `${i + 1}. `}</span>
                    {e.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}
                  </td>
                  <td className="num td-actions">
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {canWithdraw && (
                        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => withdraw(e.entryId)}>ยกเลิก</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
