"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { ThaiDatePicker } from "@/components/ThaiDatePicker";
import { ThaiDateTimePicker } from "@/components/ThaiDateTimePicker";
import { formatThaiDate } from "@/lib/domain";

export type EventItem = {
  id: number;
  name: string;
  kind: string;
  status: string;
  eventDate: string; // ISO "YYYY-MM-DD" หรือ "" — ใช้เป็นค่าเริ่มต้น "วันที่แข่ง" ตอนสร้างรายการ
  visibleToStudents: boolean;
  registrationOpen: boolean;
  regStart: string; // datetime-local string หรือ ""
  regEnd: string;
  // ช่วงที่ครูสร้าง/แก้ไข/ลบรายการแข่งขันในงานนี้ได้ (admin ทำได้เสมอ)
  compEditOpen: boolean;
  compEditStart: string;
  compEditEnd: string;
  /** เหตุผลที่ครูแก้รายการไม่ได้ ณ ตอนนี้ (null = ยังแก้ได้) — คิดมาจากเซิร์ฟเวอร์ */
  compEditReason: string | null;
  // การเปลี่ยนตัวผู้เข้าแข่งขัน — สวิตช์แยกเดี่ยว/ทีม + ช่วงเวลาที่ใช้ร่วมกัน
  subOpenIndividual: boolean;
  subOpenTeam: boolean;
  subStart: string;
  subEnd: string;
  /** สรุปสถานะการเปลี่ยนตัว ณ ตอนนี้ (null = ปิดทั้งเดี่ยวและทีม) — คิดมาจากเซิร์ฟเวอร์ */
  subStatus: { label: string; open: boolean } | null;
  competitionCount: number;
};

export function EventsManager({
  events,
  defaultEventId,
}: {
  events: EventItem[];
  defaultEventId: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("competition");
  const [eventDate, setEventDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  async function create() {
    if (!name.trim()) {
      setMsg({ type: "error", text: "กรุณากรอกชื่องาน" });
      return toast("กรุณากรอกชื่องาน", "error");
    }
    setBusy(true); setMsg(null);
    const res = await api.post<{ id: number }>("/api/admin/certificate-events", {
      name,
      kind,
      eventDate: eventDate || null,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg({ type: "error", text: res.error });
      return toast(res.error, "error");
    }
    setName("");
    setEventDate("");
    setMsg({ type: "success", text: "สร้างงานแล้ว — ตั้งค่าการรับสมัครด้านล่าง" });
    toast("สร้างงานแล้ว — ตั้งค่าการรับสมัครด้านล่าง");
    router.refresh();
  }

  async function setDefault(id: number | null) {
    const res = await api.patch("/api/admin/settings", { defaultEventId: id });
    if (!res.ok) {
      setMsg({ type: "error", text: res.error });
      return toast(res.error, "error");
    }
    toast(id ? "ตั้งเป็นงานเริ่มต้นแล้ว" : "ยกเลิกงานเริ่มต้นแล้ว");
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h3>สร้างงานใหม่</h3>
        {msg && <div className={`alert alert-${msg.type === "error" ? "error" : "success"}`}>{msg.text}</div>}
        <div className="form-row">
          <label className="field" style={{ flex: 2 }}>
            <span>ชื่องาน</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น งานแข่งขันทางวิชาการ ปีการศึกษา 2569 / อบรม Python" />
          </label>
          <label className="field">
            <span>ประเภท</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="competition">งานแข่งขัน</option>
              <option value="training">งานอบรม</option>
            </select>
          </label>
          <label className="field">
            <span>วันจัดงาน (ไม่บังคับ)</span>
            <ThaiDatePicker value={eventDate} onChange={setEventDate} />
          </label>
        </div>
        <div>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            <Icon name="plus" size={18} /> สร้างงาน
          </button>
        </div>
      </div>

      <div className="card stack">
        <div className="row between">
          <h3 style={{ margin: 0 }}>งานทั้งหมด</h3>
          <label className="field" style={{ maxWidth: 320, margin: 0 }}>
            <span>งานเริ่มต้น (เลือกไว้ให้ตอนสร้างรายการ)</span>
            <select value={defaultEventId ?? ""} onChange={(e) => setDefault(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— ไม่กำหนด —</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        </div>

        {!events.length && <div className="subtitle">ยังไม่มีงาน — สร้างงานแรกด้านบน</div>}
        {events.map((e) => (
          <EventEditRow key={e.id} ev={e} isDefault={e.id === defaultEventId} />
        ))}
      </div>
    </div>
  );
}

function EventEditRow({ ev, isDefault }: { ev: EventItem; isDefault: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [f, setF] = useState(ev);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof EventItem>(k: K, v: EventItem[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!f.name.trim()) {
      setMsg("กรุณากรอกชื่องาน");
      return toast("กรุณากรอกชื่องาน", "error");
    }
    setBusy(true); setMsg(null);
    const res = await api.patch(`/api/admin/certificate-events/${ev.id}`, {
      name: f.name,
      kind: f.kind,
      eventDate: f.eventDate || null,
      visibleToStudents: f.visibleToStudents,
      registrationOpen: f.registrationOpen,
      regStart: f.regStart || null,
      regEnd: f.regEnd || null,
      compEditOpen: f.compEditOpen,
      compEditStart: f.compEditStart || null,
      compEditEnd: f.compEditEnd || null,
      subOpenIndividual: f.subOpenIndividual,
      subOpenTeam: f.subOpenTeam,
      subStart: f.subStart || null,
      subEnd: f.subEnd || null,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return toast(res.error, "error");
    }
    toast(`บันทึก “${f.name}” เรียบร้อยแล้ว`);
    router.refresh();
  }

  async function del() {
    const ok = await confirm({
      title: "ลบงาน",
      message: `ยืนยันลบงาน "${ev.name}"? (ลบไม่ได้ถ้ายังมีรายการหรือออกเกียรติบัตรแล้ว)`,
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    const res = await api.del(`/api/admin/certificate-events/${ev.id}`);
    if (!res.ok) {
      setMsg(res.error);
      return toast(res.error, "error");
    }
    toast(`ลบงาน “${ev.name}” แล้ว`);
    router.refresh();
  }

  return (
    <div className="report-select-group" style={{ padding: 12 }}>
      <div className="row between" style={{ alignItems: "center" }}>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>{ev.name}</strong>
          <span className="badge">{ev.kind === "training" ? "อบรม" : "แข่งขัน"}</span>
          {ev.visibleToStudents && <span className="badge badge-purple">นักเรียนเห็น</span>}
          {ev.registrationOpen && <span className="badge badge-gold">เปิดรับสมัคร</span>}
          {ev.compEditReason && <span className="badge badge-warning">ครูแก้รายการไม่ได้</span>}
          {ev.subStatus?.open && <span className="badge badge-purple">เปลี่ยนตัวได้</span>}
          {isDefault && <span className="badge badge-purple">ค่าเริ่มต้น</span>}
          {ev.eventDate && <span className="muted text-sm">· จัดวันที่ {formatThaiDate(ev.eventDate)}</span>}
          <span className="muted text-sm">· {ev.competitionCount} รายการ</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>{open ? "ปิด" : "แก้ไข"}</button>
          <Link href={`/admin/certificates/${ev.id}`} className="btn btn-sm">ออกแบบเกียรติบัตร</Link>
        </div>
      </div>

      {open && (
        <div className="stack" style={{ marginTop: 12 }}>
          {msg && <div className="alert alert-error">{msg}</div>}
          <div className="form-row">
            <label className="field" style={{ flex: 2 }}>
              <span>ชื่องาน</span>
              <input value={f.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label className="field">
              <span>ประเภท</span>
              <select value={f.kind} onChange={(e) => set("kind", e.target.value)}>
                <option value="competition">งานแข่งขัน</option>
                <option value="training">งานอบรม</option>
              </select>
            </label>
            <label className="field">
              <span>วันจัดงาน</span>
              <ThaiDatePicker value={f.eventDate} onChange={(v) => set("eventDate", v)} />
            </label>
          </div>
          <span className="form-hint" style={{ marginTop: -8 }}>
            วันจัดงานจะถูกเติมเป็นค่าเริ่มต้นของ “วันที่แข่ง” ตอนสร้างรายการในงานนี้
          </span>
          <label className="form-check">
            <input type="checkbox" checked={f.visibleToStudents} onChange={(e) => set("visibleToStudents", e.target.checked)} />
            <span>ให้นักเรียนเห็นงานนี้ (แสดงในหน้าสมัคร)</span>
          </label>
          <label className="form-check">
            <input type="checkbox" checked={f.registrationOpen} onChange={(e) => set("registrationOpen", e.target.checked)} />
            <span>เปิดรับสมัคร</span>
          </label>
          <div className="grid-2">
            <div className="field">
              <span>เปิดรับสมัคร (วัน-เวลา)</span>
              <ThaiDateTimePicker value={f.regStart} onChange={(v) => set("regStart", v)} defaultTime="08:00" />
            </div>
            <div className="field">
              <span>ปิดรับสมัคร (วัน-เวลา)</span>
              <ThaiDateTimePicker value={f.regEnd} onChange={(v) => set("regEnd", v)} defaultTime="16:30" />
            </div>
          </div>
          <span className="form-hint" style={{ marginTop: -8 }}>
            เวลาเป็นแบบ 24 ชั่วโมง (00–23 น.) · เว้นว่างไว้ = ไม่จำกัดช่วงเวลา
          </span>

          <div style={{ borderTop: "0.5px solid var(--skdw-border)", paddingTop: 12 }}>
            <strong className="text-sm">การสร้าง/แก้ไขรายการแข่งขันของครู</strong>
            {ev.compEditReason && (
              <div className="text-sm muted">ขณะนี้: {ev.compEditReason} (ครูแก้ไม่ได้ · ผู้ดูแลระบบยังแก้ได้)</div>
            )}
          </div>
          <label className="form-check">
            <input type="checkbox" checked={f.compEditOpen} onChange={(e) => set("compEditOpen", e.target.checked)} />
            <span>ให้ครูสร้าง/แก้ไข/ลบรายการแข่งขันในงานนี้ได้</span>
          </label>
          <div className="grid-2">
            <div className="field">
              <span>เปิดให้แก้ไขรายการ (วัน-เวลา)</span>
              <ThaiDateTimePicker value={f.compEditStart} onChange={(v) => set("compEditStart", v)} defaultTime="08:00" />
            </div>
            <div className="field">
              <span>ปิดการแก้ไขรายการ (วัน-เวลา)</span>
              <ThaiDateTimePicker value={f.compEditEnd} onChange={(v) => set("compEditEnd", v)} defaultTime="16:30" />
            </div>
          </div>
          <span className="form-hint" style={{ marginTop: -8 }}>
            นอกช่วงนี้ ครูจะสร้าง/แก้ไข/ลบรายการในงานนี้ไม่ได้ — ผู้ดูแลระบบยังทำได้ตลอด ·
            เว้นว่างไว้ = ไม่จำกัดช่วงเวลา · ควรปิดก่อนวันที่นักเรียนเริ่มลงทะเบียน
          </span>

          <div style={{ borderTop: "0.5px solid var(--skdw-border)", paddingTop: 12 }}>
            <strong className="text-sm">การเปลี่ยนตัวผู้เข้าแข่งขัน</strong>
            {ev.subStatus && (
              <div className="text-sm muted">ขณะนี้: {ev.subStatus.label}</div>
            )}
            {!ev.subStatus && (
              <div className="text-sm muted">ขณะนี้: ปิดการเปลี่ยนตัวทั้งเดี่ยวและทีม (ผู้ดูแลระบบยังเปลี่ยนได้)</div>
            )}
          </div>
          <label className="form-check">
            <input type="checkbox" checked={f.subOpenIndividual} onChange={(e) => set("subOpenIndividual", e.target.checked)} />
            <span>ให้เปลี่ยนตัวได้ — รายการประเภทเดี่ยว</span>
          </label>
          <label className="form-check">
            <input type="checkbox" checked={f.subOpenTeam} onChange={(e) => set("subOpenTeam", e.target.checked)} />
            <span>ให้เปลี่ยนตัวได้ — รายการประเภททีม</span>
          </label>
          <div className="grid-2">
            <div className="field">
              <span>เริ่มเปลี่ยนตัวได้ (วัน-เวลา)</span>
              <ThaiDateTimePicker value={f.subStart} onChange={(v) => set("subStart", v)} defaultTime="08:00" />
            </div>
            <div className="field">
              <span>ปิดการเปลี่ยนตัว (วัน-เวลา)</span>
              <ThaiDateTimePicker value={f.subEnd} onChange={(v) => set("subEnd", v)} defaultTime="16:30" />
            </div>
          </div>
          <span className="form-hint" style={{ marginTop: -8 }}>
            ช่วงเวลาใช้ร่วมกันทั้งเดี่ยวและทีม · เว้นว่างไว้ = ไม่จำกัดช่วงเวลา (เปิดค้างจนกว่าจะปิดสวิตช์) ·
            ครูเปลี่ยนได้เฉพาะรายการในหมวดตัวเอง — ผู้ดูแลระบบเปลี่ยนได้ทุกรายการตลอดเวลา ·
            ทุกครั้งที่เปลี่ยนจะมีประวัติว่าใครเปลี่ยนจากใครเป็นใคร ที่เมนู “การเปลี่ยนตัว”
          </span>

          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
            {ev.competitionCount === 0 && <button className="btn btn-sm btn-danger" onClick={del}>ลบงาน</button>}
          </div>
        </div>
      )}
    </div>
  );
}
