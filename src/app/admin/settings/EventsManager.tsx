"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { ThaiDatePicker } from "@/components/ThaiDatePicker";
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
  const [name, setName] = useState("");
  const [kind, setKind] = useState("competition");
  const [eventDate, setEventDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  async function create() {
    if (!name.trim()) return setMsg({ type: "error", text: "กรุณากรอกชื่องาน" });
    setBusy(true); setMsg(null);
    const res = await api.post<{ id: number }>("/api/admin/certificate-events", {
      name,
      kind,
      eventDate: eventDate || null,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setName("");
    setEventDate("");
    setMsg({ type: "success", text: "สร้างงานแล้ว — ตั้งค่าการรับสมัครด้านล่าง" });
    router.refresh();
  }

  async function setDefault(id: number | null) {
    const res = await api.patch("/api/admin/settings", { defaultEventId: id });
    if (!res.ok) return setMsg({ type: "error", text: res.error });
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
  const [f, setF] = useState(ev);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof EventItem>(k: K, v: EventItem[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!f.name.trim()) return setMsg("กรุณากรอกชื่องาน");
    setBusy(true); setMsg(null);
    const res = await api.patch(`/api/admin/certificate-events/${ev.id}`, {
      name: f.name,
      kind: f.kind,
      eventDate: f.eventDate || null,
      visibleToStudents: f.visibleToStudents,
      registrationOpen: f.registrationOpen,
      regStart: f.regStart || null,
      regEnd: f.regEnd || null,
    });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
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
    if (!res.ok) return setMsg(res.error);
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
            <label className="field">
              <span>เปิดรับสมัคร (เวลา)</span>
              <input type="datetime-local" value={f.regStart} onChange={(e) => set("regStart", e.target.value)} />
            </label>
            <label className="field">
              <span>ปิดรับสมัคร (เวลา)</span>
              <input type="datetime-local" value={f.regEnd} onChange={(e) => set("regEnd", e.target.value)} />
            </label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>บันทึก</button>
            {ev.competitionCount === 0 && <button className="btn btn-sm btn-danger" onClick={del}>ลบงาน</button>}
          </div>
        </div>
      )}
    </div>
  );
}
