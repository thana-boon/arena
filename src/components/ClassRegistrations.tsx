"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { useConfirm } from "@/components/ConfirmDialog";
import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { CompTypeBadge, teamSizeLabel } from "@/components/CompTypeBadge";
import {
  CLASS_LEVELS,
  formatThaiDate,
  formatSeats,
  seatsFull,
  hhmm,
  type RoomComp,
  type RoomOverviewRow,
  type RoomStudent,
} from "@/lib/domain";
import { useClassRooms } from "@/lib/useClassRooms";

type Resp = { students: RoomStudent[]; yearBe: number | null; competitions: RoomComp[] };
type Overview = { rooms: RoomOverviewRow[]; total: number; registered: number; yearBe: number };

export type EventOption = { id: number; name: string };
export type Homeroom = { classLevel: string; classRoom: string };

/**
 * ดูรายชื่อนักเรียนทีละห้อง พร้อมรายการแข่งขันที่แต่ละคนสมัครไว้ + กดสมัครแทนนักเรียนได้
 * - admin: เลือกดูได้ทุกห้อง และ override ได้เมื่อสมัครแล้วติดกติกา (เวลาแข่งชน ฯลฯ)
 * - ครูทั่วไป: เห็นเฉพาะห้องที่ตัวเองเป็นครูประจำชั้น (จาก SchoolOS) — server บังคับซ้ำอีกชั้น
 */
export function ClassRegistrations({
  events = [],
  defaultEventId = null,
  isAdmin = false,
  homerooms = [],
}: {
  events?: EventOption[];
  defaultEventId?: number | null;
  isAdmin?: boolean;
  homerooms?: Homeroom[];
}) {
  const confirm = useConfirm();
  const [level, setLevel] = useState("");
  const [room, setRoom] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // นักเรียนที่กำลังเปิดฟอร์ม "สมัครให้" อยู่
  const [regFor, setRegFor] = useState<RoomStudent | null>(null);
  // entryId ที่กำลังยกเลิกอยู่ (กันกดซ้ำ)
  const [cancelBusy, setCancelBusy] = useState<number | null>(null);
  // ภาพรวมทุกห้อง (admin) — โหลดเมื่อกดปุ่ม ไม่โหลดอัตโนมัติ (ต้องกวาดนักเรียนทั้งโรงเรียนจาก SchoolOS)
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ovBusy, setOvBusy] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  // มุมมองภาพรวม: grid = ตารางไขว้ชั้น×ห้อง เห็นทั้งโรงเรียนในจอเดียว, list = ตารางรายห้องแบบเดิม
  const [ovView, setOvView] = useState<"grid" | "list">("grid");
  // กรองตามงาน — ค่าเริ่มต้นตามที่ admin ตั้งไว้ (ถ้ามี) ไม่งั้นแสดงทุกงาน
  const [eventFilter, setEventFilter] = useState<number | "all">(() =>
    defaultEventId != null && events.some((e) => e.id === defaultEventId) ? defaultEventId : "all"
  );

  // ครูทั่วไปไม่ต้องดึงรายชื่อห้อง (เลือกได้เฉพาะห้องประจำชั้น) — ส่ง "" ให้ hook ไม่ยิง API
  const { rooms, loading: roomsLoading } = useClassRooms(isAdmin ? level : "");

  async function load(nextLevel: string, nextRoom: string) {
    setLevel(nextLevel);
    setRoom(nextRoom);
    setData(null);
    setErr("");
    setRegFor(null);
    if (!nextLevel || !nextRoom) return;
    setBusy(true);
    const sp = new URLSearchParams({ class_level: nextLevel, class_room: nextRoom });
    const res = await api.get<Resp>(`/api/registrations/by-room?${sp.toString()}`);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setData(res.data);
  }

  async function loadOverview() {
    setOvBusy(true);
    setErr("");
    const sp = eventFilter === "all" ? "" : `?event_id=${eventFilter}`;
    // กวาดนักเรียนทั้งโรงเรียนจาก SchoolOS — นานกว่า request ทั่วไป (ฝั่ง server มีงบเวลา 45 วิของมันเอง)
    const res = await api.get<Overview>(`/api/registrations/overview${sp}`, { timeoutMs: 60_000 });
    setOvBusy(false);
    if (!res.ok) return setErr(res.error);
    setOverview(res.data);
    setShowOverview(true);
  }

  // Esc = ปิดภาพรวม
  useEffect(() => {
    if (!showOverview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowOverview(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showOverview]);

  // เปลี่ยนตัวกรอง "งาน" ตอนภาพรวมเปิดอยู่ → โหลดใหม่ให้ตัวเลขตรงกับตัวกรอง
  useEffect(() => {
    if (isAdmin && showOverview) loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventFilter]);

  // หลังสมัคร/ยกเลิกสำเร็จ — โหลดห้องซ้ำ + อัปเดตภาพรวมถ้าเปิดอยู่
  function afterMutation() {
    load(level, room);
    if (isAdmin && showOverview) loadOverview();
  }

  // ครูประจำชั้นห้องเดียว → เปิดห้องตัวเองให้เลย ไม่ต้องกดเลือก
  useEffect(() => {
    if (!isAdmin && homerooms.length === 1) {
      load(homerooms[0].classLevel, homerooms[0].classRoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ครูที่ไม่ได้เป็นครูประจำชั้น — ไม่มีห้องให้ดู
  if (!isAdmin && homerooms.length === 0) {
    return (
      <div className="empty-state card">
        <Icon name="graduation" size={44} className="empty-ico" />
        <p>คุณไม่ได้เป็นครูประจำชั้นในปีการศึกษานี้</p>
        <p className="text-sm">หน้านี้แสดงเฉพาะห้องที่ตนเองเป็นครูประจำชั้น (ข้อมูลจากระบบ SchoolOS) — หากข้อมูลไม่ถูกต้อง กรุณาแจ้งผู้ดูแลระบบ</p>
      </div>
    );
  }

  // ใช้ดูว่ารายการที่สมัครไปเป็นทีมไหม + งานยังเปิดรับอยู่ไหม (คุมปุ่มยกเลิกของครูทั่วไป)
  const compById = new Map((data?.competitions ?? []).map((c) => [c.id, c]));

  async function cancelReg(s: RoomStudent, r: RoomStudent["registrations"][number]) {
    const comp = compById.get(r.competitionId);
    const isTeam = comp?.type === "team" || !!r.teamName;
    const ok = await confirm({
      title: "ยกเลิกการสมัคร",
      message: isTeam
        ? `ยืนยันยกเลิกการสมัคร "${r.competitionName}"? เป็นรายการทีม — จะยกเลิกทั้งทีม${r.teamName ? ` "${r.teamName}"` : ""} ไม่ใช่เฉพาะ ${s.name}`
        : `ยืนยันยกเลิกการสมัคร "${r.competitionName}" ของ ${s.name}?`,
      confirmText: "ยกเลิกการสมัคร",
      cancelText: "ไม่",
      danger: true,
    });
    if (!ok) return;
    setCancelBusy(r.entryId);
    setErr("");
    const res = await api.del(`/api/registrations/${r.entryId}`);
    setCancelBusy(null);
    if (!res.ok) return setErr(res.error);
    afterMutation();
  }

  // กรองรายการสมัครของแต่ละคนตามงานที่เลือก (สถิติด้านล่างนับตามตัวกรองด้วย)
  const students = (data?.students ?? []).map((s) => ({
    ...s,
    registrations:
      eventFilter === "all" ? s.registrations : s.registrations.filter((r) => r.eventId === eventFilter),
  }));
  const registeredCount = students.filter((s) => s.registrations.length > 0).length;
  const registeredPct = students.length ? Math.round((registeredCount / students.length) * 100) : 0;

  return (
    <div className="stack">
      <div className="card">
        <div className="filter-bar">
          {isAdmin ? (
            <>
              <div className="form-group" style={{ marginBottom: 0, width: 140 }}>
                <label className="form-label">ระดับชั้น</label>
                <select className="form-select" value={level} onChange={(e) => load(e.target.value, "")}>
                  <option value="">— เลือกระดับชั้น —</option>
                  {CLASS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, width: 140 }}>
                <label className="form-label">ห้อง</label>
                <select className="form-select" value={room} onChange={(e) => load(level, e.target.value)} disabled={!level || !rooms.length}>
                  <option value="">{roomsLoading ? "กำลังโหลด…" : "— เลือกห้อง —"}</option>
                  {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="form-group" style={{ marginBottom: 0, width: 200 }}>
              <label className="form-label">ห้องประจำชั้นของคุณ</label>
              <select
                className="form-select"
                value={level && room ? `${level}|${room}` : ""}
                onChange={(e) => {
                  const [l, r] = e.target.value.split("|");
                  load(l ?? "", r ?? "");
                }}
              >
                {homerooms.length > 1 && <option value="">— เลือกห้อง —</option>}
                {homerooms.map((h) => (
                  <option key={`${h.classLevel}|${h.classRoom}`} value={`${h.classLevel}|${h.classRoom}`}>
                    {h.classLevel}/{h.classRoom}
                  </option>
                ))}
              </select>
            </div>
          )}
          {events.length > 1 && (
            <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
              <label className="form-label">งาน</label>
              <select
                className="form-select"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              >
                <option value="all">ทุกงาน</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
          )}
          {isAdmin && (
            <button className="btn btn-ghost" disabled={ovBusy} onClick={loadOverview}>
              <Icon name="chart" size={14} /> {ovBusy ? "กำลังโหลด…" : "ภาพรวมทุกห้อง"}
            </button>
          )}
          {busy && <div className="muted text-sm">กำลังโหลดรายชื่อ…</div>}
        </div>
        {err && <div className="form-error mt-2">{err}</div>}
      </div>

      {/* ภาพรวมทุกห้อง — modal (portal ไป body ด้วยเหตุผลเดียวกับ RegisterModal ด้านล่าง) */}
      {isAdmin && showOverview && overview && (() => {
        const ovPct = overview.total ? Math.round((overview.registered / overview.total) * 100) : 0;
        return createPortal(
          <div className="modal-overlay" onClick={() => setShowOverview(false)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="ภาพรวมการสมัครทุกห้อง"
              style={{ maxWidth: 900, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="row between" style={{ gap: 8, alignItems: "center" }}>
                <h3 className="modal-title" style={{ margin: 0 }}>ภาพรวมทุกห้อง</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setOvView(ovView === "grid" ? "list" : "grid")}
                >
                  {ovView === "grid" ? "แบบรายการ" : "แบบตาราง"}
                </button>
              </div>
              <div className="muted text-sm mt-2">
                {overview.rooms.length} ห้อง · นักเรียน {overview.total} คน · สมัครแล้ว {overview.registered} คน ({ovPct}%)
                {eventFilter !== "all" && " · เฉพาะงานที่เลือก"} · สมัครอย่างน้อย 1 รายการ = นับว่าสมัครแล้ว
              </div>
              <div className="row mt-2 mb-4" style={{ gap: 10, alignItems: "center" }}>
                <Bar pct={ovPct} label="สัดส่วนนักเรียนที่สมัครแล้วทั้งโรงเรียน" />
                <span className="text-sm" style={{ fontWeight: 600, minWidth: 42, textAlign: "right" }}>{ovPct}%</span>
              </div>
              {ovView === "grid" ? (
                <OverviewGrid
                  rooms={overview.rooms}
                  onPick={(lv, rm) => {
                    load(lv, rm);
                    setShowOverview(false);
                  }}
                />
              ) : (
              <div className="table-wrap table-cards" style={{ overflow: "auto", flex: 1 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>ห้อง</th>
                      <th className="num" style={{ width: 80 }}>นักเรียน</th>
                      <th className="num" style={{ width: 90 }}>สมัครแล้ว</th>
                      <th>ความคืบหน้า</th>
                      <th className="num" style={{ width: 60 }}>%</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.rooms.map((r) => {
                      const pct = r.total ? Math.round((r.registered / r.total) * 100) : 0;
                      const done = r.total > 0 && r.registered >= r.total;
                      return (
                        <tr key={`${r.classLevel}/${r.classRoom}`}>
                          <td className="td-title">
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: "0 6px" }}
                              title="เปิดดูรายชื่อห้องนี้"
                              // เลือกห้องแล้วปิดภาพรวม — รายชื่อห้องนั้นอยู่ข้างหลัง modal
                              onClick={() => {
                                load(r.classLevel, r.classRoom);
                                setShowOverview(false);
                              }}
                            >
                              {r.classLevel}/{r.classRoom}
                            </button>
                          </td>
                          <td className="num" data-label="นักเรียน">{r.total}</td>
                          <td className="num" data-label="สมัครแล้ว">{r.registered}</td>
                          <td className="td-block" data-label="ความคืบหน้า">
                            <div className="row" style={{ gap: 10, alignItems: "center" }}>
                              <Bar pct={pct} label={`สัดส่วนที่สมัครแล้วของห้อง ${r.classLevel}/${r.classRoom}`} />
                            </div>
                          </td>
                          <td className="num" data-label="%">{pct}%</td>
                          <td data-label="สถานะ">
                            {done ? (
                              <span className="badge badge-success">ครบ</span>
                            ) : (
                              <span className="muted text-sm">ขาด {r.total - r.registered}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!overview.rooms.length && <tr><td colSpan={6} className="text-center muted">ไม่พบข้อมูลนักเรียน</td></tr>}
                  </tbody>
                </table>
              </div>
              )}
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={() => setShowOverview(false)}>ปิด</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {!data && !busy && (
        <div className="empty-state card">
          <Icon name="graduation" size={44} className="empty-ico" />
          <p>{isAdmin ? "เลือกระดับชั้นและห้องเพื่อดูรายชื่อนักเรียน" : "เลือกห้องประจำชั้นเพื่อดูรายชื่อนักเรียน"}</p>
          <p className="text-sm">จะแสดงว่านักเรียนแต่ละคนสมัครกิจกรรมอะไรไปแล้วบ้าง และกดสมัครแทนนักเรียนได้</p>
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
              <Bar pct={registeredPct} />
              <span className="text-sm" style={{ fontWeight: 600, minWidth: 42, textAlign: "right" }}>{registeredPct}%</span>
            </div>
          )}
          <div className="table-wrap table-cards">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>ลำดับ</th>
                  <th style={{ width: 120 }}>รหัสนักเรียน</th>
                  <th>ชื่อ-สกุล</th>
                  <th className="num" style={{ width: 70 }}>จำนวน</th>
                  <th>รายการที่สมัคร</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s.studentCode}>
                    <td className="hide-sm">{i + 1}</td>
                    <td className="hide-sm">{s.studentCode}</td>
                    {/* บนมือถือรวมเป็นหัวการ์ด: ลำดับ + ชื่อ + รหัส (คอลัมน์ซ้ายถูกซ่อน) */}
                    <td className="td-title">
                      <span className="only-sm muted">{i + 1}. </span>
                      {s.name}
                      <div className="only-sm text-xs muted">รหัส {s.studentCode}</div>
                    </td>
                    {/* บนมือถือไม่ต้องมี — ช่อง "รายการที่สมัคร" ด้านล่างบอกอยู่แล้วว่ามีกี่รายการ/ยังไม่สมัคร */}
                    <td className="num hide-sm">{s.registrations.length || ""}</td>
                    <td className="td-block" data-label="รายการที่สมัคร">
                      {!s.registrations.length ? (
                        <span className="muted text-sm">ยังไม่ได้สมัคร</span>
                      ) : (
                        <div className="stack" style={{ gap: 4 }}>
                          {s.registrations.map((r) => {
                            // ครูทั่วไปยกเลิกได้เฉพาะตอนงานยังเปิดรับสมัคร (เหมือนนักเรียนยกเลิกเอง) — admin ยกเลิกได้เสมอ
                            const rc = compById.get(r.competitionId);
                            const canCancel = isAdmin || rc?.open === true;
                            // ไม่รู้จักรายการ (คนละงาน/ปิดไปแล้ว) ก็ยังเดาจากการมีชื่อทีมได้
                            const rType = rc?.type ?? (r.teamName ? "team" : "individual");
                            return (
                              <div key={r.entryId} className="text-sm row" style={{ gap: 6, alignItems: "center" }}>
                                <span>
                                  <span className="badge badge-purple">{r.groupName}</span>{" "}
                                  <CompTypeBadge
                                    type={rType}
                                    teamSizeMin={rc?.teamSizeMin}
                                    teamSizeMax={rc?.teamSizeMax}
                                    size="sm"
                                  />{" "}
                                  {r.competitionName}
                                  {r.teamName && <span className="muted"> · ทีม {r.teamName}</span>}
                                  {r.eventDate && <span className="muted"> · {formatThaiDate(r.eventDate)}</span>}
                                </span>
                                {canCancel && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: "0 6px", color: "var(--skdw-red, #dc2626)" }}
                                    title="ยกเลิกการสมัครนี้"
                                    aria-label={`ยกเลิกการสมัคร ${r.competitionName}`}
                                    disabled={cancelBusy === r.entryId}
                                    onClick={() => cancelReg(s, r)}
                                  >
                                    {cancelBusy === r.entryId ? "…" : "✕"}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="td-actions" style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setRegFor(s)}>
                          <Icon name="plus" size={13} /> สมัครให้
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!students.length && <tr><td colSpan={6} className="text-center muted">ไม่พบนักเรียนในห้องนี้</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {regFor && data && (
        <RegisterModal
          student={regFor}
          comps={data.competitions}
          isAdmin={isAdmin}
          onClose={() => setRegFor(null)}
          onDone={afterMutation}
        />
      )}
    </div>
  );
}

/* ---------- ภาพรวมแบบตารางไขว้ ชั้น × ห้อง ----------
   16 ระดับชั้น × ห้องไม่กี่ห้อง = กริดเล็ก ๆ ที่เห็นทั้งโรงเรียนได้ในจอเดียวโดยไม่ต้องเลื่อน
   (ตารางรายห้องแบบเดิมยาว 30-50 แถว ต้องไล่เลื่อนหา) — สีบอกสถานะ ตัวเลขบอกรายละเอียด */

const OV_TIERS = [
  { min: 100, cls: "ov-full", label: "ครบ" },
  { min: 75, cls: "ov-high", label: "75-99%" },
  { min: 40, cls: "ov-mid", label: "40-74%" },
  { min: 0, cls: "ov-low", label: "ต่ำกว่า 40%" },
] as const;

function tierOf(pct: number) {
  return OV_TIERS.find((t) => pct >= t.min) ?? OV_TIERS[OV_TIERS.length - 1];
}

function OverviewGrid({
  rooms,
  onPick,
}: {
  rooms: RoomOverviewRow[];
  onPick: (classLevel: string, classRoom: string) => void;
}) {
  // คอลัมน์ = ชื่อห้องทุกแบบที่พบจริง (ปกติ 1..3) เรียงเลขก่อน แล้วค่อยเรียงตัวอักษร
  const roomCols = [...new Set(rooms.map((r) => r.classRoom))].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, "th");
  });

  // แถว = ระดับชั้นตามลำดับ CLASS_LEVELS (ชั้นแปลก ๆ ที่ไม่อยู่ในลิสต์ต่อท้าย)
  const levelOrder = (l: string) => {
    const i = (CLASS_LEVELS as readonly string[]).indexOf(l);
    return i === -1 ? 999 : i;
  };
  const levels = [...new Set(rooms.map((r) => r.classLevel))].sort(
    (a, b) => levelOrder(a) - levelOrder(b) || a.localeCompare(b, "th")
  );
  const byKey = new Map(rooms.map((r) => [`${r.classLevel}|${r.classRoom}`, r]));

  if (!rooms.length) return <div className="text-center muted mt-4">ไม่พบข้อมูลนักเรียน</div>;

  return (
    <div className="stack" style={{ gap: 8, flex: 1, minHeight: 0 }}>
      <div className="ov-grid-wrap" style={{ overflow: "auto", flex: 1 }}>
        <table className="ov-grid">
          <thead>
            <tr>
              <th className="ov-corner">ชั้น</th>
              {roomCols.map((rm) => <th key={rm}>ห้อง {rm}</th>)}
              <th className="ov-sum-col">รวมทั้งชั้น</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((lv) => {
              const cells = roomCols.map((rm) => byKey.get(`${lv}|${rm}`) ?? null);
              const total = cells.reduce((s, c) => s + (c?.total ?? 0), 0);
              const registered = cells.reduce((s, c) => s + (c?.registered ?? 0), 0);
              const lvPct = total ? Math.round((registered / total) * 100) : 0;
              return (
                <tr key={lv}>
                  <th className="ov-lv">{lv}</th>
                  {cells.map((c, i) => {
                    if (!c) return <td key={roomCols[i]} className="ov-cell ov-none">·</td>;
                    const pct = c.total ? Math.round((c.registered / c.total) * 100) : 0;
                    return (
                      <td key={roomCols[i]} className={`ov-cell ${tierOf(pct).cls}`}>
                        <button
                          type="button"
                          onClick={() => onPick(c.classLevel, c.classRoom)}
                          title={`เปิดดูรายชื่อ ${c.classLevel}/${c.classRoom}`}
                          aria-label={`${c.classLevel}/${c.classRoom} สมัครแล้ว ${c.registered} จาก ${c.total} คน ${pct}%`}
                        >
                          <span className="ov-pct">{pct}%</span>
                          <span className="ov-cnt">{c.registered}/{c.total}</span>
                        </button>
                      </td>
                    );
                  })}
                  <td className={`ov-cell ov-sum ${tierOf(lvPct).cls}`}>
                    <span className="ov-pct">{lvPct}%</span>
                    <span className="ov-cnt">{registered}/{total}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ov-legend muted text-sm">
        {OV_TIERS.map((t) => (
          <span key={t.cls}><i className={`ov-swatch ${t.cls}`} />{t.label}</span>
        ))}
        <span>· แตะช่องเพื่อเปิดรายชื่อห้องนั้น</span>
      </div>
    </div>
  );
}

/* ---------- แถบ progress — ม่วงระหว่างทาง เขียวเมื่อครบ 100% ---------- */

function Bar({ pct, label }: { pct: number; label?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "สัดส่วนนักเรียนที่สมัครแล้ว"}
      style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--skdw-bg, #eee)", overflow: "hidden" }}
    >
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: "100%",
          borderRadius: 999,
          background: pct >= 100 ? "var(--skdw-green, #16a34a)" : "var(--skdw-purple, #7c3aed)",
          transition: "width .3s ease",
        }}
      />
    </div>
  );
}

/* ---------- ฟอร์มสมัครแทนนักเรียน 1 คน ---------- */

/**
 * จัดรายการแข่งขันเป็นหมวด (สาระ) สำหรับ <optgroup> — ครูสะท้อนว่าลิสต์ยาวเรียงมั่ว หาไม่เจอ
 * - เรียงหมวดตาม sortOrder ที่ admin ตั้งไว้ ให้ตรงลำดับกับหน้าหมวด
 * - ในหมวดเดียวกัน: ที่ยังเปิดรับขึ้นก่อน แล้วเรียงชื่อไทย
 * - มีหลายงานในปีเดียวกัน → ใส่ชื่องานนำหน้าชื่อหมวด ไม่งั้นหมวดชื่อซ้ำข้ามงานจะแยกไม่ออก
 */
function groupByCategory(comps: RoomComp[]) {
  const multiEvent = new Set(comps.map((c) => c.eventId)).size > 1;
  const map = new Map<string, { key: string; label: string; sort: number; eventName: string; items: RoomComp[] }>();
  for (const c of comps) {
    const key = `${c.eventId ?? 0}|${c.groupName}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        label: multiEvent ? `${c.eventName} · ${c.groupName}` : c.groupName,
        sort: c.groupSort,
        eventName: c.eventName,
        items: [],
      };
      map.set(key, g);
    }
    g.items.push(c);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name, "th"));
  }
  groups.sort(
    (a, b) =>
      (multiEvent ? a.eventName.localeCompare(b.eventName, "th") : 0) ||
      a.sort - b.sort ||
      a.label.localeCompare(b.label, "th")
  );
  return groups;
}

function toPicked(s: RoomStudent): PickedStudent {
  return { studentCode: s.studentCode, name: s.name, classLevel: s.classLevel, classRoom: s.classRoom };
}

function RegisterModal({
  student,
  comps,
  isAdmin,
  onClose,
  onDone,
}: {
  student: RoomStudent;
  comps: RoomComp[];
  isAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const confirm = useConfirm();
  // ตัดรายการที่นักเรียนคนนี้ลงไปแล้ว
  const registeredIds = new Set(student.registrations.map((r) => r.competitionId));
  const available = comps.filter((c) => !registeredIds.has(c.id));
  const categories = groupByCategory(available);

  const [compId, setCompId] = useState<number | "">("");
  const comp = available.find((c) => c.id === compId) ?? null;
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<PickedStudent[]>([toPicked(student)]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // สมัครแล้วติดกติกา (เวลาชน/ปิดรับ ฯลฯ) → admin จะได้ปุ่ม override
  const [offerOverride, setOfferOverride] = useState(false);

  function pickComp(id: number | "") {
    setCompId(id);
    setTeamName("");
    setMembers([toPicked(student)]);
    setErr("");
    setOfferOverride(false);
  }

  const full = comp ? seatsFull(comp.registered, comp.capacity) : false;
  const closed = comp ? !comp.open : false;
  // ปิดรับ: ครูทั่วไปสมัครไม่ได้เลย — admin กดได้ (server จะแจ้ง แล้วค่อย override)
  const blocked = full || (closed && !isAdmin);
  const teamReady =
    !comp || comp.type !== "team" || members.length >= (comp.teamSizeMin ?? 1);

  async function submit(override = false) {
    if (!comp) return;
    const ok = await confirm({
      title: override ? "ยืนยันการสมัครแบบ override" : "ยืนยันการสมัคร",
      message: override
        ? `สมัคร "${comp.name}" ให้ ${student.name} โดยข้ามกติกา (เวลาชน/จำนวนรายการ/ช่วงรับสมัคร)?`
        : comp.type === "team"
          ? `สมัครทีมรายการ "${comp.name}" (${members.length} คน)?`
          : `สมัครรายการ "${comp.name}" ให้ ${student.name}?`,
      confirmText: override ? "Override" : "สมัคร",
      danger: override,
    });
    if (!ok) return;
    setBusy(true);
    setErr("");
    const res = await api.post(`/api/registrations`, {
      competitionId: comp.id,
      memberCodes: members.map((m) => m.studentCode),
      teamName: comp.type === "team" ? teamName || null : null,
      ...(override ? { override: true } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      if (isAdmin && !override) setOfferOverride(true);
      return;
    }
    onDone();
  }

  // portal ไป body — ถ้า render ในหน้า ancestor ที่มี transform (route transition) จะทำให้
  // position:fixed ยึดกับหน้าแทน viewport → modal ไปโผล่กลางความสูงของหน้า ต้องเลื่อนหา
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`สมัครให้ ${student.name}`}
        style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">สมัครให้ {student.name}</h3>
        <div className="muted text-sm mb-4">
          {student.classLevel}/{student.classRoom} · รหัส {student.studentCode}
        </div>

        {!available.length ? (
          <p className="modal-message">ไม่มีรายการแข่งขันที่เปิดรับระดับชั้นนี้ หรือนักเรียนลงครบทุกรายการแล้ว</p>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                รายการแข่งขัน{" "}
                <span className="muted" style={{ fontWeight: 400 }}>— แบ่งตามหมวด ({available.length} รายการ)</span>
              </label>
              <select
                className="form-select"
                value={compId}
                onChange={(e) => pickComp(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">— เลือกรายการ —</option>
                {/* หัวข้อหมวดใน dropdown — เดิมเป็นลิสต์ยาวแถบเดียว ครูต้องไล่อ่านทีละบรรทัด */}
                {categories.map((g) => (
                  <optgroup key={g.key} label={`${g.label} (${g.items.length})`}>
                    {g.items.map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.open && !isAdmin}>
                        {/* บอกประเภทเสมอ (เดิมบอกเฉพาะทีม → รายการเดี่ยวไม่มีอะไรให้เทียบ เลยดูไม่ออกว่าอันไหนเป็นทีม) */}
                        {c.name} ·{" "}
                        {c.type === "team"
                          ? `ทีม ${teamSizeLabel("team", c.teamSizeMin, c.teamSizeMax)}`.trim()
                          : "เดี่ยว 1 คน"}
                        {!c.open ? " · ปิดรับสมัคร" : ""}
                        {c.hiddenFromStudents ? " · ซ่อนจากนักเรียน" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {comp && (
              <div className="text-sm" style={{ background: "var(--skdw-bg)", padding: "10px 12px", borderRadius: 8 }}>
                <div className="row mb-2" style={{ gap: 8 }}>
                  <CompTypeBadge type={comp.type} teamSizeMin={comp.teamSizeMin} teamSizeMax={comp.teamSizeMax} />
                  <span className="badge badge-purple">{comp.eventName}</span>
                  {full && <span className="badge badge-error">เต็ม</span>}
                  {closed && <span className="badge badge-warning">ปิดรับสมัคร</span>}
                  {/* เห็นได้เฉพาะครูที่ดูแลรายการนี้/แอดมิน — บอกไว้ว่านักเรียนสมัครเองไม่ได้ */}
                  {comp.hiddenFromStudents && <span className="badge">ซ่อนจากนักเรียน</span>}
                </div>
                ที่นั่ง {formatSeats(comp.registered, comp.capacity)}
                {comp.eventDate && ` · ${formatThaiDate(comp.eventDate)} ${hhmm(comp.startTime)}–${hhmm(comp.endTime)}`}
              </div>
            )}

            {comp?.type === "team" && (
              <>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">ชื่อทีม (ถ้ามี)</label>
                  <input className="form-input" style={{ maxWidth: 320 }} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="เช่น ทีมดาวรุ่ง" />
                </div>
                <div>
                  <label className="form-label">
                    สมาชิกในทีม ({members.length}/{comp.teamSizeMax}){" "}
                    <span className="muted" style={{ fontWeight: 400 }}>
                      — รายการนี้ต้องมี {teamSizeLabel("team", comp.teamSizeMin, comp.teamSizeMax)} (รวม {student.name})
                    </span>
                  </label>
                  <div className="stack" style={{ gap: 6 }}>
                    {members.map((m) => (
                      <div key={m.studentCode} className="row between" style={{ background: "var(--skdw-bg)", padding: "6px 12px", borderRadius: 6 }}>
                        <span>{m.name} <span className="muted text-sm">({m.classLevel}/{m.classRoom})</span></span>
                        {m.studentCode === student.studentCode ? (
                          <span className="badge badge-purple">คนนี้</span>
                        ) : (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMembers(members.filter((x) => x.studentCode !== m.studentCode))}>ออก</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {members.length < (comp.teamSizeMax ?? 99) && (
                    <div className="mt-4">
                      <StudentPicker
                        levels={comp.levels}
                        // ไม่ให้ข้ามห้อง → ล็อกห้องตามนักเรียนที่กำลังสมัครให้
                        restrictRoom={
                          comp.allowCrossClass
                            ? null
                            : { classLevel: student.classLevel, classRoom: student.classRoom }
                        }
                        excludeCodes={members.map((m) => m.studentCode)}
                        remaining={(comp.teamSizeMax ?? 99) - members.length}
                        onPick={(s) =>
                          setMembers((prev) =>
                            prev.length >= (comp.teamSizeMax ?? 99) || prev.some((x) => x.studentCode === s.studentCode) ? prev : [...prev, s]
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {err && (
              <div className="alert alert-error" style={{ margin: 0 }}>
                {err}
                {offerOverride && (
                  <div className="mt-2">
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => submit(true)}>
                      สมัครแบบ override (ข้ามกติกา)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>ปิด</button>
          {available.length > 0 && (
            <button
              className="btn btn-primary"
              disabled={!comp || busy || blocked || !teamReady}
              onClick={() => submit(false)}
            >
              {busy ? "กำลังสมัคร…" : "สมัคร"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
