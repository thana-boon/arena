"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type S = {
  maxEntriesPerStudent: number;
  registrationOpen: boolean;
  regStart: string;
  regEnd: string;
  medalGoldPct: number;
  medalSilverPct: number;
  medalBronzePct: number;
};

export function SettingsForm({ initial }: { initial: S }) {
  const router = useRouter();
  const [f, setF] = useState<S>(initial);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof S>(k: K, v: S[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await api.patch("/api/admin/settings", {
      ...f,
      regStart: f.regStart || null,
      regEnd: f.regEnd || null,
    });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setMsg({ type: "success", text: "บันทึกข้อมูลเรียบร้อยแล้ว" });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card" style={{ maxWidth: 640 }}>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="form-group">
        <label className="form-check">
          <input type="checkbox" checked={f.registrationOpen} onChange={(e) => set("registrationOpen", e.target.checked)} />
          <span>เปิดรับสมัคร (สวิตช์หลัก)</span>
        </label>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">เปิดรับสมัครตั้งแต่</label>
          <input type="datetime-local" className="form-input" value={f.regStart} onChange={(e) => set("regStart", e.target.value)} />
          <div className="form-hint">เว้นว่างได้ถ้าไม่จำกัดช่วงเวลา</div>
        </div>
        <div className="form-group">
          <label className="form-label">ปิดรับสมัครเมื่อ</label>
          <input type="datetime-local" className="form-input" value={f.regEnd} onChange={(e) => set("regEnd", e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">จำนวนรายการสูงสุดต่อนักเรียน</label>
        <input type="number" min={1} max={20} className="form-input" style={{ width: 120 }} value={f.maxEntriesPerStudent} onChange={(e) => set("maxEntriesPerStudent", Number(e.target.value))} />
      </div>

      <h3 className="mt-4">เกณฑ์เหรียญ (ร้อยละ)</h3>
      <div className="grid-3">
        <div className="form-group">
          <label className="form-label">เหรียญทอง ≥</label>
          <input type="number" min={0} max={100} className="form-input" value={f.medalGoldPct} onChange={(e) => set("medalGoldPct", Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">เหรียญเงิน ≥</label>
          <input type="number" min={0} max={100} className="form-input" value={f.medalSilverPct} onChange={(e) => set("medalSilverPct", Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">เหรียญทองแดง ≥</label>
          <input type="number" min={0} max={100} className="form-input" value={f.medalBronzePct} onChange={(e) => set("medalBronzePct", Number(e.target.value))} />
        </div>
      </div>

      <button className="btn btn-primary mt-4" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
    </form>
  );
}
