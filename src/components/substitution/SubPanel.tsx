"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { formatThaiDate, hhmm } from "@/lib/domain";
import type { SubCompDetail } from "@/lib/substitutions";

/**
 * ชั้นที่สามของหน้าเปลี่ยนตัว — รายชื่อจริง + ปุ่มเปลี่ยนรายคน + ประวัติการเปลี่ยน
 *
 * เปลี่ยนทีละคน (ไม่ทำแบบเลือกหลายคนพร้อมกัน) โดยตั้งใจ: การเปลี่ยนตัวแต่ละครั้งมีเหตุผลของตัวเอง
 * และกติกาที่ต้องตรวจ (เวลาชน/ห้องเดียวกัน/ลงซ้ำ) ขึ้นกับคนที่เลือกเข้ามาทีละคนอยู่แล้ว
 */
export function SubPanel({
  detail,
  backHref,
}: {
  detail: SubCompDetail;
  backHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { competition: comp, roster, history, gate, windowReason, isAdmin } = detail;

  /** entry_members.id ที่กำลังเปิดฟอร์มเปลี่ยนตัวอยู่ (ทีละคน) */
  const [openMemberId, setOpenMemberId] = useState<number | null>(null);
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // คนที่อยู่ในรายการนี้แล้วทุกคน — เลือกซ้ำไม่ได้อยู่แล้ว (server ปฏิเสธ) จึงไม่ต้องให้โผล่ในช่องค้นหา
  const registeredCodes = roster.flatMap((e) => e.members.map((m) => m.studentCode));
  const memberCount = roster.reduce((s, e) => s + e.members.length, 0);

  function openFor(memberId: number) {
    setOpenMemberId(memberId);
    setPicked(null);
    setReason("");
    setMsg(null);
  }

  function close() {
    setOpenMemberId(null);
    setPicked(null);
    setReason("");
  }

  async function submit(outName: string) {
    if (!picked || openMemberId == null) return;
    const okToGo = await confirm({
      title: "ยืนยันการเปลี่ยนตัว",
      message: `เปลี่ยนจาก "${outName}" เป็น "${picked.name}" (${picked.classLevel}/${picked.classRoom}) ในรายการ "${comp.name}"?`,
      confirmText: "เปลี่ยนตัว",
    });
    if (!okToGo) return;

    setBusy(true);
    setMsg(null);
    const res = await api.post("/api/substitutions", {
      memberId: openMemberId,
      newStudentCode: picked.studentCode,
      reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg({ type: "error", text: res.error });
      return toast(res.error, "error");
    }
    close();
    setMsg({ type: "success", text: `เปลี่ยนตัวจาก ${outName} เป็น ${picked.name} เรียบร้อยแล้ว` });
    toast("เปลี่ยนตัวเรียบร้อยแล้ว");
    router.refresh();
  }

  const teamNoCross = comp.type === "team" && !comp.allowCrossClass;

  return (
    <div className="stack">
      <div className="page-bar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{comp.name}</h1>
          <div className="subtitle">
            {comp.eventName}
            {comp.groupName && ` · ${comp.groupName}`} ·{" "}
            {comp.type === "team" ? `ทีม (${comp.allowCrossClass ? "ข้ามห้องได้" : "ห้ามข้ามห้อง"})` : "เดี่ยว"}
            {comp.eventDate && ` · ${formatThaiDate(comp.eventDate)}`}
            {comp.startTime && ` ${hhmm(comp.startTime)}–${hhmm(comp.endTime)} น.`}
          </div>
        </div>
        <Link href={backHref} className="btn btn-sm">
          <Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> เลือกรายการอื่น
        </Link>
      </div>

      {!gate.allowed && <div className="alert alert-warning">{gate.message}</div>}
      {gate.allowed && windowReason && isAdmin && (
        <div className="alert alert-info">
          {windowReason} — ท่านเปลี่ยนได้เพราะเป็นผู้ดูแลระบบ (บันทึกไว้ในประวัติและบันทึกการใช้งาน)
        </div>
      )}
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <div className="row between mb-4">
          <div className="card-header" style={{ padding: 0, border: "none" }}>
            ผู้เข้าแข่งขัน ({memberCount} คน)
          </div>
        </div>

        {!memberCount ? (
          <div className="empty-state">
            <Icon name="clipboard" size={44} className="empty-ico" />
            <p>ยังไม่มีผู้ลงทะเบียนในรายการนี้</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {roster.map((e, i) => {
              // ทีมห้ามข้ามห้อง → คนใหม่ต้องอยู่ห้องเดียวกับ "เพื่อนร่วมทีมที่เหลือ"
              // (ไม่ใช่ห้องของคนที่กำลังถูกเปลี่ยนออก — เขากำลังจะไม่อยู่ในทีมแล้ว)
              const others = e.members.filter((m) => m.memberId !== openMemberId);
              const teammateRoom = teamNoCross && others.length ? others[0] : null;
              return (
                <div key={e.entryId} className="report-select-group" style={{ padding: 12 }}>
                  {comp.type === "team" && (
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {e.teamName || `ทีมที่ ${i + 1}`}
                    </div>
                  )}
                  <div className="stack" style={{ gap: 8 }}>
                    {e.members.map((m) => (
                      <div key={m.memberId} className="stack" style={{ gap: 8 }}>
                        <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
                          <span>
                            {m.name}{" "}
                            <span className="muted text-sm">
                              ({m.classLevel}/{m.classRoom})
                            </span>
                            {m.substituted && (
                              <span className="badge badge-purple" style={{ marginLeft: 6 }}>
                                เปลี่ยนตัว
                              </span>
                            )}
                          </span>
                          {gate.allowed &&
                            (openMemberId === m.memberId ? (
                              <button className="btn btn-ghost btn-sm" onClick={close} disabled={busy}>
                                ยกเลิก
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm"
                                onClick={() => openFor(m.memberId)}
                                disabled={busy}
                              >
                                <Icon name="restore" size={16} /> เปลี่ยนตัว
                              </button>
                            ))}
                        </div>

                        {openMemberId === m.memberId && (
                          <div className="card" style={{ background: "var(--skdw-bg)" }}>
                            <div className="form-hint" style={{ marginBottom: 8 }}>
                              เลือกนักเรียนที่จะเข้าแข่งแทน <strong>{m.name}</strong>
                              {teamNoCross && teammateRoom && (
                                <> · รายการนี้ห้ามทีมข้ามห้อง เลือกได้เฉพาะห้อง {teammateRoom.classLevel}/{teammateRoom.classRoom}</>
                              )}
                            </div>

                            {picked ? (
                              <div
                                className="row between"
                                style={{ background: "#fff", padding: "8px 12px", borderRadius: 6, marginBottom: 8 }}
                              >
                                <span>
                                  คนใหม่: <strong>{picked.name}</strong>{" "}
                                  <span className="muted text-sm">
                                    ({picked.classLevel}/{picked.classRoom})
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setPicked(null)}
                                >
                                  เลือกใหม่
                                </button>
                              </div>
                            ) : (
                              <StudentPicker
                                excludeCodes={registeredCodes}
                                levels={comp.allowedLevels}
                                remaining={1}
                                restrictRoom={
                                  teamNoCross && teammateRoom
                                    ? { classLevel: teammateRoom.classLevel, classRoom: teammateRoom.classRoom }
                                    : null
                                }
                                onPick={(s) => setPicked(s)}
                              />
                            )}

                            <div className="form-group mt-4" style={{ marginBottom: 0 }}>
                              <label className="form-label">เหตุผล (ไม่บังคับ)</label>
                              <input
                                className="form-input"
                                value={reason}
                                maxLength={255}
                                placeholder="เช่น ป่วย ลากิจ ติดสอบ"
                                onChange={(ev) => setReason(ev.target.value)}
                              />
                            </div>

                            <div className="row mt-4">
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={!picked || busy}
                                onClick={() => submit(m.name)}
                              >
                                {busy ? "กำลังเปลี่ยน…" : "ยืนยันเปลี่ยนตัว"}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={close} disabled={busy}>
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header" style={{ padding: 0, border: "none", marginBottom: 12 }}>
          ประวัติการเปลี่ยนตัว ({history.length})
        </div>
        {!history.length ? (
          <div className="subtitle mb-0">ยังไม่เคยเปลี่ยนตัวในรายการนี้</div>
        ) : (
          <div className="table-wrap table-cards">
            <table className="table">
              <thead>
                <tr>
                  <th>คนเดิม</th>
                  <th>คนใหม่</th>
                  <th>เหตุผล</th>
                  <th>ผู้เปลี่ยน</th>
                  <th>เมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="td-title">
                      {h.outName} <span className="muted text-sm">({h.outClass || "—"})</span>
                    </td>
                    <td data-label="คนใหม่">
                      {h.inName} <span className="muted text-sm">({h.inClass || "—"})</span>
                    </td>
                    <td data-label="เหตุผล">{h.reason || <span className="muted">—</span>}</td>
                    <td data-label="ผู้เปลี่ยน" className="text-sm">
                      {h.byName || h.byCode}
                    </td>
                    <td data-label="เมื่อ" className="text-sm">
                      {h.createdAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
