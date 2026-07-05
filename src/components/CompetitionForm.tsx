"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { CLASS_LEVELS } from "@/lib/domain";

/** รับได้ทั้ง "13:20", "13.20", "1320", "830" → คืนรูปแบบ "HH:MM" (คืน "" ถ้าว่าง/ไม่ถูกต้อง) */
function normalizeTime(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const cleaned = s.replace(/[.．：]/g, ":");
  let h: string, m: string;
  if (cleaned.includes(":")) {
    [h, m = "0"] = cleaned.split(":");
  } else {
    const digits = cleaned.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length <= 2) { h = digits; m = "0"; }
    else { h = digits.slice(0, digits.length - 2); m = digits.slice(-2); }
  }
  let hh = parseInt(h, 10);
  let mm = parseInt(m, 10);
  if (isNaN(hh)) return "";
  if (isNaN(mm)) mm = 0;
  if (hh > 23) hh = 23;
  if (mm > 59) mm = 59;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export type CompFormInitial = {
  id?: number;
  name: string;
  subjectGroupId: number | "";
  type: "individual" | "team";
  teamSizeMin: number | "";
  teamSizeMax: number | "";
  allowedClassLevels: string[];
  eventDate: string;
  startTime: string;
  endTime: string;
  capacityPerLevel: Record<string, number>;
  teamCapacity: number;
  criteria: { name: string; maxScore: number | "" }[];
  locked?: boolean; // มีคนลงแล้ว
};

export function CompetitionForm({
  groups,
  initial,
  returnTo = "/teacher/competitions",
  lockSubjectGroup = false,
}: {
  groups: { id: number; name: string }[];
  initial: CompFormInitial;
  /** ปลายทางหลังบันทึกสำเร็จ (admin ใช้ /admin/competitions เพื่อคงแถบเมนู admin) */
  returnTo?: string;
  /** ครูทั่วไปเลือกได้เฉพาะหมวดตัวเอง → ล็อกช่องหมวดไว้ (admin ปลดล็อกเลือกได้ทุกหมวด) */
  lockSubjectGroup?: boolean;
}) {
  const router = useRouter();
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
    setBusy(true);
    const startTime = normalizeTime(f.startTime);
    const endTime = normalizeTime(f.endTime);
    const payload = {
      name: f.name,
      subjectGroupId: Number(f.subjectGroupId),
      type: f.type,
      teamSizeMin: f.type === "team" && f.teamSizeMin !== "" ? Number(f.teamSizeMin) : null,
      teamSizeMax: f.type === "team" && f.teamSizeMax !== "" ? Number(f.teamSizeMax) : null,
      allowedClassLevels: f.allowedClassLevels,
      eventDate: f.eventDate || null,
      startTime: startTime ? `${startTime}:00` : null,
      endTime: endTime ? `${endTime}:00` : null,
      capacityPerLevel: f.capacityPerLevel,
      teamCapacity: f.teamCapacity,
      criteria: f.criteria.map((c) => ({ name: c.name, maxScore: Number(c.maxScore) })),
    };
    const res = initial.id
      ? await api.patch<{ locked: boolean }>(`/api/competitions/${initial.id}`, payload)
      : await api.post<{ id: number }>("/api/competitions", payload);
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
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">หมวดวิชา</label>
            <select className="form-select" value={f.subjectGroupId} disabled={lockSubjectGroup} onChange={(e) => set("subjectGroupId", e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">— เลือกหมวดวิชา —</option>
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
      </div>

      <div className="card stack">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ระดับชั้นที่รับ</label>
          <div className="level-grid">
            {CLASS_LEVELS.map((lv) => {
              const on = f.allowedClassLevels.includes(lv);
              return (
                <label key={lv} className={`level-chip${on ? " on" : ""}${locked ? " disabled" : ""}`}>
                  <input type="checkbox" checked={on} disabled={locked} onChange={() => toggleLevel(lv)} />
                  <span>{lv}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label className="form-label">จำนวนรับ {f.type === "team" ? "(จำนวนทีม)" : "(ต่อระดับชั้น)"}</label>
          {f.type === "team" ? (
            <input type="number" min={0} className="form-input" style={{ width: 160 }} value={f.teamCapacity} onChange={(e) => set("teamCapacity", Number(e.target.value))} />
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
        </div>
      </div>

      <div className="card stack">
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">วันที่แข่ง</label>
            <input type="date" lang="th" className="form-input" value={f.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
          </div>
          <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">เริ่ม</label>
              <input
                type="text" inputMode="numeric" className="form-input" style={{ width: 100 }}
                placeholder="13:20" maxLength={5} value={f.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                onBlur={(e) => set("startTime", normalizeTime(e.target.value))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">ถึง</label>
              <input
                type="text" inputMode="numeric" className="form-input" style={{ width: 100 }}
                placeholder="15:30" maxLength={5} value={f.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                onBlur={(e) => set("endTime", normalizeTime(e.target.value))}
              />
            </div>
            <span className="form-hint" style={{ marginBottom: 8 }}>รูปแบบ 24 ชม. เช่น 13:20</span>
          </div>
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
