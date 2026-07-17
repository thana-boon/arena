"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";

type EventRow = {
  id: number;
  name: string;
  eventDate: string | null;
  status: string;
  competitionCount: number;
  issuedCount: number;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "ฉบับร่าง",
  published: "เผยแพร่แล้ว",
  locked: "ล็อก (ออกใบแล้ว)",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "badge",
  published: "badge-gold",
  locked: "badge-purple",
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function CertEventsManager({ events }: { events: EventRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  async function create() {
    if (!name.trim()) return setMsg({ type: "error", text: "กรุณากรอกชื่องาน" });
    setBusy(true); setMsg(null);
    const res = await api.post<{ id: number }>("/api/admin/certificate-events", {
      name,
      eventDate: date || null,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.push(`${BASE}/admin/certificates/${res.data.id}`);
  }

  async function del(e: EventRow) {
    const ok = await confirm({
      title: "ลบงาน",
      message: `ยืนยันลบงาน "${e.name}"?`,
      confirmText: "ลบ",
      danger: true,
    });
    if (!ok) return;
    const res = await api.del(`/api/admin/certificate-events/${e.id}`);
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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น การแข่งขันวันวิชาการ ครั้งที่ 5" />
          </label>
          <label className="field">
            <span>วันที่จัดงาน (ไม่บังคับ)</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            <Icon name="plus" size={18} /> สร้างและตั้งค่า
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty-state card">
          <Icon name="file" size={44} className="empty-ico" />
          <p>ยังไม่มีงานเกียรติบัตร</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>ชื่องาน</th>
                <th>สถานะ</th>
                <th style={{ textAlign: "center" }}>รายการแข่งขัน</th>
                <th style={{ textAlign: "center" }}>ออกแล้ว</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`${BASE}/admin/certificates/${e.id}`} className="link">{e.name}</Link>
                  </td>
                  <td><span className={STATUS_CLASS[e.status] ?? "badge"}>{STATUS_LABEL[e.status] ?? e.status}</span></td>
                  <td style={{ textAlign: "center" }}>{e.competitionCount}</td>
                  <td style={{ textAlign: "center" }}>{e.issuedCount}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`${BASE}/admin/certificates/${e.id}`} className="btn btn-sm">ตั้งค่า</Link>
                    {e.issuedCount === 0 && (
                      <button className="btn btn-sm btn-danger" onClick={() => del(e)} style={{ marginInlineStart: 6 }}>ลบ</button>
                    )}
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
