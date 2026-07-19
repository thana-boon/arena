"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { CLASS_LEVELS, UNLIMITED_CAPACITY, formatSlot, hhmm } from "@/lib/domain";

export type SlotOption = { id: number; label: string; startTime: string; endTime: string };
export type VenueOption = { id: number; name: string; building: string };

type VenueConflict = { id: number; name: string; startTime: string | null; endTime: string | null };

export type CompFormInitial = {
  id?: number;
  name: string;
  description: string;
  eventId: number | "";
  subjectGroupId: number | "";
  type: "individual" | "team";
  /** นักเรียนเห็นรายการนี้ในหน้าสมัครหรือไม่ (false = ครูลงให้อย่างเดียว) */
  visibleToStudents: boolean;
  teamSizeMin: number | "";
  teamSizeMax: number | "";
  allowedClassLevels: string[];
  timeSlotId: number | "";
  venueId: number | "";
  eventDate: string;
  capacityMode: "per_level" | "combined";
  /** รับนักเรียนแบบไม่จำกัดจำนวน (ค่า default) */
  unlimited: boolean;
  capacityPerLevel: Record<string, number>;
  combinedCapacity: number;
  teamCapacity: number;
  criteria: { name: string; maxScore: number | "" }[];
  locked?: boolean; // มีคนลงแล้ว
};

export function CompetitionForm({
  events,
  groups,
  slots,
  venues,
  initial,
  returnTo = "/teacher/competitions",
  lockSubjectGroup = false,
}: {
  events: { id: number; name: string; kind: string }[];
  groups: { id: number; name: string }[];
  slots: SlotOption[];
  venues: VenueOption[];
  initial: CompFormInitial;
  /** ปลายทางหลังบันทึกสำเร็จ (admin ใช้ /admin/competitions เพื่อคงแถบเมนู admin) */
  returnTo?: string;
  /** ครูทั่วไปเลือกได้เฉพาะหมวดตัวเอง → ล็อกช่องหมวดไว้ (admin ปลดล็อกเลือกได้ทุกหมวด) */
  lockSubjectGroup?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [f, setF] = useState<CompFormInitial>(initial);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = !!initial.locked;

  function set<K extends keyof CompFormInitial>(k: K, v: CompFormInitial[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }
  function toggleLevel(lv: string) {
    setF((p) => {
      const has = p.allowedClassLevels.includes(lv);
      return { ...p, allowedClassLevels: has ? p.allowedClassLevels.filter((x) => x !== lv) : [...p.allowedClassLevels, lv] };
    });
  }
  function setCap(lv: string, v: number) {
    setF((p) => ({ ...p, capacityPerLevel: { ...p.capacityPerLevel, [lv]: v } }));
  }
  function setCrit(i: number, key: "name" | "maxScore", v: string) {
    setF((p) => {
      const c = [...p.criteria];
      c[i] = { ...c[i], [key]: key === "maxScore" ? (v === "" ? "" : Number(v)) : v };
      return { ...p, criteria: c };
    });
  }
  const fullScore = useMemo(
    () => f.criteria.reduce((s, c) => s + (typeof c.maxScore === "number" ? c.maxScore : 0), 0),
    [f.criteria]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!f.eventId) return setMsg({ type: "error", text: "กรุณาเลือกงาน" });
    if (!f.timeSlotId) return setMsg({ type: "error", text: "กรุณาเลือกช่วงเวลาแข่งขัน" });
    setBusy(true);
    // จำนวนรับ: ไม่จำกัด → -1 ทุกช่อง; จำกัด → ใช้ค่าที่กรอก (ช่องว่าง = 0)
    const capacityPerLevel = Object.fromEntries(
      f.allowedClassLevels.map((lv) => [lv, f.unlimited ? UNLIMITED_CAPACITY : f.capacityPerLevel[lv] ?? 0])
    );
    const payload = {
      name: f.name,
      description: f.description,
      eventId: Number(f.eventId),
      subjectGroupId: f.subjectGroupId === "" ? null : Number(f.subjectGroupId),
      type: f.type,
      visibleToStudents: f.visibleToStudents,
      teamSizeMin: f.type === "team" && f.teamSizeMin !== "" ? Number(f.teamSizeMin) : null,
      teamSizeMax: f.type === "team" && f.teamSizeMax !== "" ? Number(f.teamSizeMax) : null,
      allowedClassLevels: f.allowedClassLevels,
      timeSlotId: Number(f.timeSlotId),
      venueId: f.venueId === "" ? null : Number(f.venueId),
      eventDate: f.eventDate || null,
      capacityMode: f.type === "individual" ? f.capacityMode : "per_level",
      capacityPerLevel,
      combinedCapacity: f.unlimited ? UNLIMITED_CAPACITY : f.combinedCapacity,
      teamCapacity: f.unlimited ? UNLIMITED_CAPACITY : f.teamCapacity,
      criteria: f.criteria.map((c) => ({ name: c.name, maxScore: Number(c.maxScore) })),
    };

    // ยิงคำขอ (force = ยืนยันใช้สถานที่ที่ชนกับรายการอื่น)
    type Resp = { id?: number; locked?: boolean; venueConflict?: boolean; conflicts?: VenueConflict[] };
    const send = (force: boolean) => {
      const body = force ? { ...payload, forceVenue: true } : payload;
      return initial.id
        ? api.patch<Resp>(`/api/competitions/${initial.id}`, body)
        : api.post<Resp>("/api/competitions", body);
    };

    let res = await send(false);
    // สถานที่ชนกับรายการก่อนหน้า → ถามยืนยันใช้ห้องเดียวกัน
    if (res.ok && res.data.venueConflict) {
      const list = (res.data.conflicts ?? [])
        .map((c) => `${c.name}${c.startTime && c.endTime ? ` (${hhmm(c.startTime)}–${hhmm(c.endTime)})` : ""}`)
        .join(", ");
      const useSame = await confirm({
        title: "สถานที่ถูกใช้ในช่วงเวลาเดียวกัน",
        message: `สถานที่นี้มีรายการแข่งขันใช้อยู่ในวัน/เวลาเดียวกัน: ${list} — ต้องการใช้ห้องเดียวกันหรือไม่?`,
        confirmText: "ใช้ห้องเดียวกัน",
      });
      if (!useSame) {
        setBusy(false);
        return;
      }
      res = await send(true);
    }

    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.push(returnTo);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="stack" style={{ maxWidth: 720 }}>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {locked && <div className="alert alert-warning">รายการนี้มีผู้ลงทะเบียนแล้ว แก้ไขได้เฉพาะชื่อ/วันเวลา/จำนวนรับ (ไม่สามารถเปลี่ยนประเภท ระดับชั้น หรือเกณฑ์)</div>}

      <div className="card stack">
        <div className="form-group">
          <label className="form-label">ชื่อรายการแข่งขัน</label>
          <input className="form-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น คัดลายมือ ระดับ ม.ต้น" />
        </div>
        <div className="form-group">
          <label className="form-label">รายละเอียด</label>
          <textarea
            className="form-input"
            rows={4}
            style={{ resize: "vertical", minHeight: 88 }}
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="เช่น กติกา อุปกรณ์ที่ต้องเตรียม เกณฑ์การตัดสิน (ไม่บังคับ)"
          />
          <span className="form-hint">แสดงให้นักเรียนเห็นในหน้าสมัคร · ไม่เกิน 2000 ตัวอักษร</span>
        </div>
        <div className="form-group">
          <label className="form-label">งาน</label>
          {events.length ? (
            <select className="form-select" value={f.eventId} onChange={(e) => set("eventId", e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">— เลือกงาน —</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}{ev.kind === "training" ? " (อบรม)" : ""}</option>)}
            </select>
          ) : (
            <div className="form-hint">ยังไม่มีงาน — ผู้ดูแลระบบต้องสร้างงานที่เมนู “งาน/เกียรติบัตร” ก่อน</div>
          )}
          <span className="form-hint">งานเป็นเจ้าของช่วงเปิด-ปิดรับสมัคร และการมองเห็นของนักเรียน</span>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">หมวดวิชา (ไม่บังคับ)</label>
            <select className="form-select" value={f.subjectGroupId} disabled={lockSubjectGroup} onChange={(e) => set("subjectGroupId", e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">— ไม่ระบุหมวด —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {lockSubjectGroup && <span className="form-hint">สร้างได้เฉพาะหมวดของท่าน</span>}
          </div>
          <div className="form-group">
            <label className="form-label">ประเภท</label>
            <select className="form-select" value={f.type} disabled={locked} onChange={(e) => set("type", e.target.value as "individual" | "team")}>
              <option value="individual">เดี่ยว</option>
              <option value="team">ทีม</option>
            </select>
          </div>
        </div>

        {f.type === "team" && (
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">จำนวนสมาชิกต่ำสุด</label>
              <input type="number" min={1} className="form-input" value={f.teamSizeMin} disabled={locked} onChange={(e) => set("teamSizeMin", e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">จำนวนสมาชิกสูงสุด</label>
              <input type="number" min={1} className="form-input" value={f.teamSizeMax} disabled={locked} onChange={(e) => set("teamSizeMax", e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-check">
            <input type="checkbox" checked={f.visibleToStudents} onChange={(e) => set("visibleToStudents", e.target.checked)} />
            <span>ให้นักเรียนเห็นรายการนี้</span>
          </label>
          <span className="form-hint">
            {f.visibleToStudents
              ? "นักเรียนเห็นรายการนี้ในหน้าสมัคร และสมัครเองได้"
              : "นักเรียนมองไม่เห็นและสมัครเองไม่ได้ — ครูเป็นผู้ลงชื่อให้เท่านั้น"}
          </span>
        </div>
      </div>

      <div className="card stack">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ระดับชั้นที่รับ</label>
          <div className="level-grid">
            {CLASS_LEVELS.map((lv) => {
              const on = f.allowedClassLevels.includes(lv);
              return (
                <label key={lv} className={`level-chip${lv.length > 4 ? " wide" : ""}${on ? " on" : ""}${locked ? " disabled" : ""}`}>
                  <input type="checkbox" checked={on} disabled={locked} onChange={() => toggleLevel(lv)} />
                  <span>{lv}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label className="form-label">จำนวนรับ {f.type === "team" ? "(จำนวนทีม)" : ""}</label>
          <label className="form-check" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={f.unlimited} onChange={(e) => set("unlimited", e.target.checked)} />
            <span>รับไม่จำกัดจำนวน</span>
          </label>

          {f.unlimited ? (
            <div className="form-hint">รับนักเรียนได้ไม่จำกัดจำนวน — เอาเครื่องหมายถูกออกเพื่อกำหนดจำนวนที่นั่ง</div>
          ) : f.type === "team" ? (
            <input type="number" min={0} className="form-input" style={{ width: 160 }} value={f.teamCapacity} onChange={(e) => set("teamCapacity", Number(e.target.value))} />
          ) : (
            <>
              <div className="row" style={{ gap: 16, marginBottom: 12 }}>
                <label className="form-check">
                  <input type="radio" name="capMode" checked={f.capacityMode === "per_level"} disabled={locked} onChange={() => set("capacityMode", "per_level")} />
                  <span>แยกตามระดับชั้น</span>
                </label>
                <label className="form-check">
                  <input type="radio" name="capMode" checked={f.capacityMode === "combined"} disabled={locked} onChange={() => set("capacityMode", "combined")} />
                  <span>รวมทุกระดับชั้น</span>
                </label>
              </div>
              {f.capacityMode === "combined" ? (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">จำนวนรับรวมทุกระดับชั้น</label>
                  <input type="number" min={0} className="form-input" style={{ width: 160 }} value={f.combinedCapacity} onChange={(e) => set("combinedCapacity", Number(e.target.value))} />
                  <span className="form-hint">
                    {f.allowedClassLevels.length ? `${f.allowedClassLevels.join(" + ")} รวมกันไม่เกินจำนวนนี้` : "เลือกระดับชั้นก่อน"}
                  </span>
                </div>
              ) : (
                <div className="grid-3">
                  {f.allowedClassLevels.map((lv) => (
                    <div key={lv} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{lv}</label>
                      <input type="number" min={0} className="form-input" value={f.capacityPerLevel[lv] ?? 0} onChange={(e) => setCap(lv, Number(e.target.value))} />
                    </div>
                  ))}
                  {!f.allowedClassLevels.length && <div className="muted text-sm">เลือกระดับชั้นก่อน</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card stack">
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">วันที่แข่ง</label>
            <input type="date" lang="th" className="form-input" value={f.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">ช่วงเวลาแข่งขัน</label>
            {slots.length ? (
              <select className="form-select" value={f.timeSlotId} onChange={(e) => set("timeSlotId", e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">— เลือกช่วงเวลา —</option>
                {slots.map((sl) => (
                  <option key={sl.id} value={sl.id}>{formatSlot(sl.label, sl.startTime, sl.endTime)}</option>
                ))}
              </select>
            ) : (
              <div className="form-hint">ยังไม่มีช่วงเวลา — ผู้ดูแลระบบต้องเพิ่มช่วงเวลาที่เมนู “ช่วงเวลาแข่งขัน” ก่อน</div>
            )}
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">สถานที่แข่งขัน</label>
          {venues.length ? (
            <select className="form-select" value={f.venueId} onChange={(e) => set("venueId", e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">— ไม่ระบุ —</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.building ? `${v.building} · ${v.name}` : v.name}</option>
              ))}
            </select>
          ) : (
            <div className="form-hint">ยังไม่มีสถานที่ — ผู้ดูแลระบบเพิ่มได้ที่เมนู “สถานที่แข่งขัน”</div>
          )}
        </div>
      </div>

      <div className="card stack">
        <div className="row between">
          <label className="form-label" style={{ marginBottom: 0 }}>เกณฑ์การให้คะแนน</label>
          <span className="badge badge-purple">คะแนนเต็มรวม {fullScore}</span>
        </div>
        {f.criteria.map((c, i) => (
          <div key={i} className="row" style={{ alignItems: "flex-end" }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <input className="form-input" placeholder="ชื่อเกณฑ์ เช่น ความสวยงาม" value={c.name} disabled={locked} onChange={(e) => setCrit(i, "name", e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
              <input type="number" min={0} step="0.01" className="form-input" placeholder="คะแนนเต็ม" value={c.maxScore} disabled={locked} onChange={(e) => setCrit(i, "maxScore", e.target.value)} />
            </div>
            {!locked && f.criteria.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("criteria", f.criteria.filter((_, x) => x !== i))}>ลบ</button>
            )}
          </div>
        ))}
        {!locked && (
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => set("criteria", [...f.criteria, { name: "", maxScore: "" }])}>
            + เพิ่มเกณฑ์
          </button>
        )}
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : initial.id ? "บันทึกการแก้ไข" : "สร้างรายการ"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>ยกเลิก</button>
      </div>
      <p className="form-hint">รายการที่สร้างจะยังไม่เผยแพร่ (default ปิด) จนกว่าจะเปิดจากหน้ารายการ</p>
    </form>
  );
}
