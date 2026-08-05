"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_LEVELS,
  AUDIENCE_LABEL,
  LEVEL_LABEL,
} from "@/lib/announcementTypes";

export type AnnouncementItem = {
  id: number;
  title: string;
  body: string;
  level: string;
  audience: string;
  isActive: boolean;
  dismissible: boolean;
  createdBy: string;
  updatedAt: string; // แสดงผลอย่างเดียว (format มาจาก server แล้ว)
};

const EMPTY = {
  title: "",
  body: "",
  level: "info",
  audience: "all",
  dismissible: true,
};

export function AnnouncementsManager({ items }: { items: AnnouncementItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function create() {
    if (!f.body.trim()) {
      setMsg("กรุณากรอกข้อความประกาศ");
      return toast("กรุณากรอกข้อความประกาศ", "error");
    }
    setBusy(true);
    setMsg(null);
    const res = await api.post("/api/admin/announcements", f);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return toast(res.error, "error");
    }
    setF(EMPTY);
    toast("บันทึกประกาศแล้ว — กดสวิตช์ “แสดง” เมื่อพร้อมกระจายให้ทุกคนเห็น");
    router.refresh();
  }

  const activeCount = items.filter((a) => a.isActive).length;

  return (
    <div className="stack">
      <div className="card stack">
        <h3>เขียนประกาศใหม่</h3>
        {msg && <div className="alert alert-error">{msg}</div>}

        <label className="field">
          <span>หัวข้อ (ไม่บังคับ)</span>
          <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="เช่น ปิดรับสมัครวันศุกร์นี้" />
        </label>

        <label className="field">
          <span>ข้อความ</span>
          <textarea
            rows={3}
            value={f.body}
            onChange={(e) => set("body", e.target.value)}
            placeholder="เช่น ขอให้ครูผู้ควบคุมตรวจสอบรายชื่อนักเรียนให้เรียบร้อยภายในวันที่ 10 ส.ค."
          />
        </label>

        <div className="form-row">
          <label className="field">
            <span>แสดงให้ใครเห็น</span>
            <select value={f.audience} onChange={(e) => set("audience", e.target.value)}>
              {ANNOUNCEMENT_AUDIENCES.map((a) => (
                <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ลักษณะประกาศ</span>
            <select value={f.level} onChange={(e) => set("level", e.target.value)}>
              {ANNOUNCEMENT_LEVELS.map((l) => (
                <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="switch-row">
          <span className="switch">
            <input type="checkbox" checked={f.dismissible} onChange={(e) => set("dismissible", e.target.checked)} />
            <span className="knob" />
          </span>
          <span>
            <span className="switch-label">ให้กดปิดแถบได้</span>
            <span className="form-hint">
              {f.dismissible
                ? "ผู้อ่านกดปิดแล้วจะไม่เห็นอีก (จนกว่าจะมีการแก้ข้อความ)"
                : "แถบค้างอยู่ทุกหน้า ปิดไม่ได้ — ใช้กับเรื่องที่ทุกคนต้องเห็นจริง ๆ"}
            </span>
          </span>
        </label>

        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            <Icon name="plus" size={18} /> {busy ? "กำลังบันทึก…" : "บันทึกประกาศ"}
          </button>
          <span className="form-hint">บันทึกแล้วยังไม่แสดง — กดสวิตช์ “แสดง” ในรายการด้านล่างเมื่อพร้อม</span>
        </div>
      </div>

      <div className="card stack">
        <div className="row between" style={{ alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>ประกาศทั้งหมด</h3>
          <span className="muted text-sm">กำลังแสดงอยู่ {activeCount} รายการ</span>
        </div>
        {!items.length && <div className="subtitle">ยังไม่มีประกาศ — เขียนอันแรกด้านบน</div>}
        {items.map((a) => (
          <AnnouncementRow key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}

function AnnouncementRow({ a }: { a: AnnouncementItem }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState(a);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof AnnouncementItem>(k: K, v: AnnouncementItem[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  // สวิตช์เปิด/ปิดยิงทันทีที่กด (ไม่ต้องเข้าโหมดแก้ไข) — เป็นปุ่มที่ใช้บ่อยที่สุดของหน้านี้
  async function toggle(next: boolean) {
    setF((p) => ({ ...p, isActive: next })); // ขยับ UI ก่อน แล้วค่อยย้อนถ้าพลาด
    const res = await api.patch(`/api/admin/announcements/${a.id}`, { isActive: next });
    if (!res.ok) {
      setF((p) => ({ ...p, isActive: !next }));
      return toast(res.error, "error");
    }
    toast(next ? "เปิดแสดงประกาศแล้ว" : "ปิดประกาศแล้ว (ข้อความยังเก็บไว้)");
    router.refresh();
  }

  async function save() {
    if (!f.body.trim()) {
      setMsg("กรุณากรอกข้อความประกาศ");
      return toast("กรุณากรอกข้อความประกาศ", "error");
    }
    setBusy(true);
    setMsg(null);
    const res = await api.patch(`/api/admin/announcements/${a.id}`, {
      title: f.title,
      body: f.body,
      level: f.level,
      audience: f.audience,
      dismissible: f.dismissible,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return toast(res.error, "error");
    }
    setOpen(false);
    toast("บันทึกประกาศเรียบร้อยแล้ว — คนที่เคยกดปิดจะเห็นข้อความใหม่อีกครั้ง");
    router.refresh();
  }

  async function del() {
    const ok = await confirm({
      title: "ลบประกาศ",
      message: "ยืนยันลบประกาศนี้? (ถ้าแค่ไม่อยากให้แสดง ให้ปิดสวิตช์แทน จะได้เปิดใช้ใหม่ได้)",
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    const res = await api.del(`/api/admin/announcements/${a.id}`);
    if (!res.ok) return toast(res.error, "error");
    toast("ลบประกาศแล้ว");
    router.refresh();
  }

  return (
    <div className="report-select-group" style={{ padding: 12 }}>
      <div className="row between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            {f.isActive ? <span className="badge badge-success">กำลังแสดง</span> : <span className="badge">ปิดอยู่</span>}
            <span className="badge badge-purple">{AUDIENCE_LABEL[f.audience] ?? f.audience}</span>
            <span className={`badge ${f.level === "warning" ? "badge-warning" : f.level === "success" ? "badge-success" : "badge-info"}`}>
              {LEVEL_LABEL[f.level] ?? f.level}
            </span>
            {!f.dismissible && <span className="badge badge-gold">ปิดแถบไม่ได้</span>}
          </div>
          {f.title && <strong>{f.title}</strong>}
          <div className="ann-preview-body">{f.body}</div>
          <div className="muted text-sm" style={{ marginTop: 4 }}>
            แก้ล่าสุด {a.updatedAt}
            {a.createdBy ? ` · โดย ${a.createdBy}` : ""}
          </div>
        </div>

        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <label className="switch-row" title={f.isActive ? "กดเพื่อปิด" : "กดเพื่อแสดง"}>
            <span className="switch">
              <input type="checkbox" checked={f.isActive} onChange={(e) => toggle(e.target.checked)} />
              <span className="knob" />
            </span>
            <span className="switch-label">แสดง</span>
          </label>
          <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>{open ? "ปิด" : "แก้ไข"}</button>
        </div>
      </div>

      {open && (
        <div className="stack" style={{ marginTop: 12 }}>
          {msg && <div className="alert alert-error">{msg}</div>}
          <label className="field">
            <span>หัวข้อ</span>
            <input value={f.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="field">
            <span>ข้อความ</span>
            <textarea rows={3} value={f.body} onChange={(e) => set("body", e.target.value)} />
          </label>
          <div className="form-row">
            <label className="field">
              <span>แสดงให้ใครเห็น</span>
              <select value={f.audience} onChange={(e) => set("audience", e.target.value)}>
                {ANNOUNCEMENT_AUDIENCES.map((x) => (
                  <option key={x} value={x}>{AUDIENCE_LABEL[x]}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>ลักษณะประกาศ</span>
              <select value={f.level} onChange={(e) => set("level", e.target.value)}>
                {ANNOUNCEMENT_LEVELS.map((x) => (
                  <option key={x} value={x}>{LEVEL_LABEL[x]}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="switch-row">
            <span className="switch">
              <input type="checkbox" checked={f.dismissible} onChange={(e) => set("dismissible", e.target.checked)} />
              <span className="knob" />
            </span>
            <span className="switch-label">ให้กดปิดแถบได้</span>
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
            <button className="btn btn-sm btn-danger" onClick={del}>ลบประกาศ</button>
          </div>
        </div>
      )}
    </div>
  );
}
