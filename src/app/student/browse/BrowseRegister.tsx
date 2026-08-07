"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { CompTypeBadge, teamSizeLabel } from "@/components/CompTypeBadge";
import { formatThaiDate, formatSeats, seatsFull } from "@/lib/domain";

export type BrowseComp = {
  id: number;
  name: string;
  description: string;
  type: "individual" | "team";
  eventId: number | null;
  eventName: string;
  subjectGroupId: number | null;
  groupName: string;
  /** ลำดับหมวดตามที่แอดมินจัดไว้ — ใช้เรียงหัวข้อกลุ่มสาระในหน้านี้ */
  groupSortOrder: number;
  /** สถานที่แข่งขัน ("อาคาร · ห้อง") — ว่างถ้ายังไม่ระบุ */
  venues: string[];
  levels: string[];
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  /** ทีมมีสมาชิกข้ามห้องได้ (false = ต้องเป็นเพื่อนห้องเดียวกันเท่านั้น) */
  allowCrossClass: boolean;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number;
  registered: number;
  alreadyRegistered: boolean;
  myEntryId: number | null;
};

/** สถานะรับสมัครของแต่ละงาน — ปุ่มลงทะเบียน/ยกเลิกคุมตามงานที่รายการนั้นสังกัด ไม่ใช่สถานะรวมของทั้งปี */
export type EventState = { id: number; name: string; open: boolean; reason: string | null };

export function BrowseRegister({
  comps,
  eventStates,
  self,
}: {
  comps: BrowseComp[];
  eventStates: EventState[];
  self: PickedStudent;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [openTeam, setOpenTeam] = useState<number | null>(null);
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<PickedStudent[]>([self]);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: number; type: string; text: string } | null>(null);
  // เลือกงานก่อน แล้วค่อยแสดงรายการของงานนั้น (ลดภาระเวลารายการเยอะ)
  const [eventId, setEventId] = useState<number | null>(null);
  // กรองเฉพาะกลุ่มสาระที่เลือก (null = ทุกกลุ่มสาระ)
  const [filterGroupId, setFilterGroupId] = useState<number | null>(null);

  // สถานะรับสมัครรายงาน — งานที่ไม่รู้จัก (ไม่ควรเกิด) ถือว่าปิดไว้ก่อน
  const stateById = useMemo(() => new Map(eventStates.map((s) => [s.id, s])), [eventStates]);
  const stateOf = (id: number | null): EventState | null => (id == null ? null : stateById.get(id) ?? null);

  // สรุปงาน: จำนวนรายการ + จำนวนที่ลงทะเบียนแล้ว ในแต่ละงาน (นักเรียนเลือกงานก่อน แล้วดูรายการในงาน)
  const eventList = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number; registered: number }>();
    for (const c of comps) {
      const eid = c.eventId ?? -1;
      const e = map.get(eid) ?? { id: eid, name: c.eventName || "ทั่วไป", count: 0, registered: 0 };
      e.count += 1;
      if (c.alreadyRegistered) e.registered += 1;
      map.set(eid, e);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [comps]);

  // รายการของงานที่เลือก จัดเป็นกลุ่มสาระ เรียงตามลำดับหมวดที่แอดมินตั้งไว้
  const sections = useMemo(() => {
    if (eventId == null) return [];
    const map = new Map<number, { id: number; name: string; sortOrder: number; items: BrowseComp[] }>();
    for (const c of comps) {
      if ((c.eventId ?? -1) !== eventId) continue;
      const gid = c.subjectGroupId ?? -1;
      const s = map.get(gid) ?? { id: gid, name: c.groupName || "ทั่วไป", sortOrder: c.groupSortOrder, items: [] };
      s.items.push(c);
      map.set(gid, s);
    }
    const list = [...map.values()];
    for (const s of list) s.items.sort((a, b) => a.name.localeCompare(b.name, "th"));
    return list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));
  }, [comps, eventId]);

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
        <Icon name="search" size={44} className="empty-ico" />
        <p>ยังไม่มีรายการแข่งขันที่เปิดรับระดับชั้นของคุณ</p>
      </div>
    );
  }

  // ขั้นที่ 1: ยังไม่เลือกงาน → แสดงการ์ดงานให้เลือก
  if (eventId == null) {
    return (
      <div className="stack">
        <div className="text-sm muted">เลือกงานที่ต้องการก่อน แล้วจึงเลือกรายการแข่งขันตามกลุ่มสาระ</div>
        <div className="grid-3 stagger">
          {eventList.map((e) => {
            const st = stateOf(e.id);
            return (
              <button
                key={e.id}
                type="button"
                className="card"
                style={{ textAlign: "left", cursor: "pointer", border: "0.5px solid var(--skdw-border)" }}
                onClick={() => { setEventId(e.id); setFilterGroupId(null); setMsg(null); }}
              >
                <div className="row between mb-2">
                  <span className="badge badge-purple"><Icon name="calendar" size={13} /> งาน</span>
                  {e.registered > 0 && <span className="badge badge-success">ลงแล้ว {e.registered}</span>}
                </div>
                <h3 style={{ margin: "4px 0" }}>{e.name}</h3>
                <div className="text-sm muted">{e.count} รายการ</div>
                {/* บอกตั้งแต่การ์ดเลือกงาน — เดิมต้องกดเข้าไปแล้วปุ่มเทาเฉย ๆ โดยไม่มีเหตุผล */}
                {st && !st.open && (
                  <div className="mt-2"><span className="badge badge-warning">{st.reason}</span></div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ขั้นที่ 2: เลือกงานแล้ว → แสดงรายการของงานนั้น แยกเป็นหัวข้อตามกลุ่มสาระ
  const currentEventName = eventList.find((e) => e.id === eventId)?.name ?? "";
  const currentState = stateOf(eventId);
  const currentOpen = currentState?.open ?? false;
  const shownSections = filterGroupId == null ? sections : sections.filter((s) => s.id === filterGroupId);

  const renderCard = (c: BrowseComp) => {
    const full = seatsFull(c.registered, c.capacity);
    const canRegister = currentOpen && !c.alreadyRegistered && !full;
    return (
      <div key={c.id} className="card">
        <div className="row between">
          <div>
            <div className="row" style={{ gap: 8 }}>
              <CompTypeBadge type={c.type} teamSizeMin={c.teamSizeMin} teamSizeMax={c.teamSizeMax} />
            </div>
            <h3 style={{ margin: "8px 0 4px" }}>{c.name}</h3>
            <div className="text-sm muted">
              ที่นั่ง {formatSeats(c.registered, c.capacity)}
              {c.eventDate && ` · ${formatThaiDate(c.eventDate)} ${c.startTime?.slice(0, 5)}–${c.endTime?.slice(0, 5)}`}
            </div>
            {c.venues.length > 0 && (
              <div className="text-sm muted row" style={{ gap: 4, marginTop: 2 }}>
                <Icon name="pin" size={13} />
                <span>{c.venues.join(", ")}</span>
              </div>
            )}
            {c.description && (
              <p className="text-sm" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", maxWidth: 560 }}>{c.description}</p>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            {c.alreadyRegistered ? (
              <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                <span className="badge badge-success">ลงทะเบียนแล้ว</span>
                {currentOpen && c.myEntryId != null && (
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
            <label className="form-label">
              สมาชิกในทีม ({members.length}/{c.teamSizeMax}){" "}
              <span className="muted" style={{ fontWeight: 400 }}>
                — รายการนี้ต้องมี {teamSizeLabel("team", c.teamSizeMin, c.teamSizeMax)} (รวมตัวคุณเอง)
              </span>
            </label>
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
                  levels={c.levels}
                  // ไม่ให้ข้ามห้อง → เลือกได้เฉพาะเพื่อนห้องเดียวกับตัวเอง
                  restrictRoom={c.allowCrossClass ? null : { classLevel: self.classLevel, classRoom: self.classRoom }}
                  remaining={(c.teamSizeMax ?? 99) - members.length}
                  onPick={(s) => setMembers((prev) => (prev.length >= (c.teamSizeMax ?? 99) || prev.some((x) => x.studentCode === s.studentCode) ? prev : [...prev, s]))}
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
  };

  return (
    <div className="stack">
      <div className="row between">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEventId(null); setFilterGroupId(null); setMsg(null); }}>
          ← เลือกงานอื่น
        </button>
        <span className="badge badge-purple"><Icon name="calendar" size={13} /> {currentEventName}</span>
      </div>

      {/* งานที่เลือกปิดรับแล้ว — บอกเหตุผลตรงนี้ ไม่ปล่อยให้เจอแค่ปุ่มเทา */}
      {!currentOpen && (
        <div className="alert alert-warning row" style={{ gap: 10, alignItems: "flex-start", margin: 0 }}>
          <Icon name="warning" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>{currentState?.reason ?? "ปิดรับสมัคร"}</strong>
            <div className="text-sm">{currentEventName} — ดูรายการได้ แต่ลงทะเบียนหรือยกเลิกเองไม่ได้แล้ว หากมีเหตุจำเป็นให้ติดต่อผู้ดูแลระบบ</div>
          </div>
        </div>
      )}

      {/* ปุ่มลัดไปกลุ่มสาระ — รายการเยอะ ๆ จะได้ไม่ต้องเลื่อนหา */}
      {sections.length > 1 && (
        <div className="group-chips">
          <button
            type="button"
            className={`group-chip${filterGroupId == null ? " on" : ""}`}
            onClick={() => setFilterGroupId(null)}
          >
            ทุกกลุ่มสาระ <span className="n">{sections.reduce((s, x) => s + x.items.length, 0)}</span>
          </button>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`group-chip${filterGroupId === s.id ? " on" : ""}`}
              onClick={() => { setFilterGroupId(s.id); setMsg(null); }}
            >
              {s.name} <span className="n">{s.items.length}</span>
            </button>
          ))}
        </div>
      )}

      {shownSections.map((s) => (
        <section key={s.id} className="stack" style={{ gap: "var(--space-3)" }}>
          <div className="group-head">
            <Icon name="book" size={16} />
            <h2>{s.name}</h2>
            <span className="n">{s.items.length} รายการ</span>
          </div>
          {s.items.map(renderCard)}
        </section>
      ))}
    </div>
  );
}
