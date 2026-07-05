"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { decideMedal, scorePercent, MEDAL_LABEL, MEDAL_BADGE_CLASS } from "@/lib/domain";
import type { RosterEntry } from "@/lib/roster";

type Crit = { id: number; name: string; max: number };

export function ScoringGrid({
  competitionId,
  isPublished,
  type,
  criteria,
  roster,
  initialScores,
  medalPct,
}: {
  competitionId: number;
  isPublished: boolean;
  type: "individual" | "team";
  criteria: Crit[];
  roster: RosterEntry[];
  initialScores: Record<string, number>;
  medalPct: { gold: number; silver: number; bronze: number };
}) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const k in initialScores) v[k] = initialScores[k].toFixed(2);
    return v;
  });
  const [published, setPublished] = useState(isPublished);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  const fullScore = criteria.reduce((s, c) => s + c.max, 0);

  function key(entryId: number, critId: number) { return `${entryId}:${critId}`; }
  function setVal(entryId: number, critId: number, raw: string) {
    setVals((p) => ({ ...p, [key(entryId, critId)]: raw }));
  }

  function rowTotal(entryId: number): number {
    return criteria.reduce((s, c) => {
      const v = parseFloat(vals[key(entryId, c.id)] ?? "");
      return s + (isNaN(v) ? 0 : v);
    }, 0);
  }

  // อันดับสำหรับ preview
  const ranked = useMemo(() => {
    const arr = roster.map((e) => ({ entryId: e.entryId, total: rowTotal(e.entryId) }));
    arr.sort((a, b) => b.total - a.total);
    const rankMap: Record<number, number> = {};
    let last: number | null = null, lastRank = 0;
    arr.forEach((r, i) => {
      if (last === null || r.total !== last) { lastRank = i + 1; last = r.total; }
      rankMap[r.entryId] = lastRank;
    });
    return rankMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals, roster]);

  async function save() {
    setBusy(true); setMsg(null);
    const payload: { entryId: number; criterionId: number; score: number }[] = [];
    for (const e of roster) {
      for (const c of criteria) {
        const raw = vals[key(e.entryId, c.id)];
        if (raw === undefined || raw === "") continue;
        const num = parseFloat(raw);
        if (isNaN(num)) return (setBusy(false), setMsg({ type: "error", text: "มีคะแนนที่ไม่ใช่ตัวเลข" }));
        if (num < 0 || num > c.max) return (setBusy(false), setMsg({ type: "error", text: `คะแนน "${c.name}" ต้องอยู่ระหว่าง 0–${c.max}` }));
        payload.push({ entryId: e.entryId, criterionId: c.id, score: num });
      }
    }
    const res = await api.post(`/api/competitions/${competitionId}/scores`, { scores: payload });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setMsg({ type: "success", text: "บันทึกคะแนนเรียบร้อยแล้ว" });
    router.refresh();
  }

  async function togglePublish() {
    setBusy(true); setMsg(null);
    const res = await api.post(`/api/competitions/${competitionId}/publish`, { isPublished: !published });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setPublished(!published);
    setMsg({ type: "success", text: !published ? "ประกาศผลแล้ว" : "ยกเลิกการประกาศแล้ว" });
    router.refresh();
  }

  if (!roster.length) {
    return <div className="empty-state card"><div className="big">📋</div><p>ยังไม่มีผู้ลงทะเบียนให้บันทึกคะแนน</p></div>;
  }

  return (
    <div className="stack">
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>อันดับ</th>
              <th>{type === "team" ? "ทีม / สมาชิก" : "ผู้เข้าแข่งขัน"}</th>
              {criteria.map((c) => <th key={c.id} className="num">{c.name}<div className="text-xs muted">เต็ม {c.max}</div></th>)}
              <th className="num">รวม ({fullScore})</th>
              <th className="num">%</th>
              <th>เหรียญ</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((e) => {
              const total = rowTotal(e.entryId);
              const pct = scorePercent(total, fullScore);
              const medal = decideMedal(pct, medalPct.gold, medalPct.silver, medalPct.bronze);
              return (
                <tr key={e.entryId}>
                  <td style={{ fontWeight: 700 }}>{ranked[e.entryId]}</td>
                  <td>
                    {type === "team" && e.teamName && <div style={{ fontWeight: 600 }}>{e.teamName}</div>}
                    <div className="text-sm">{e.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}</div>
                  </td>
                  {criteria.map((c) => (
                    <td key={c.id} className="num">
                      <input
                        type="number" min={0} max={c.max} step="0.01"
                        className="form-input" style={{ width: 90, textAlign: "right", padding: "4px 8px", height: 34 }}
                        value={vals[key(e.entryId, c.id)] ?? ""}
                        onChange={(ev) => setVal(e.entryId, c.id, ev.target.value)}
                      />
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>{total.toFixed(2)}</td>
                  <td className="num">{pct.toFixed(1)}%</td>
                  <td><span className={`badge ${MEDAL_BADGE_CLASS[medal]}`}>{MEDAL_LABEL[medal]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row between">
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกคะแนน"}</button>
        <button className={`btn ${published ? "btn-ghost" : "btn-accent"}`} onClick={togglePublish} disabled={busy}>
          {published ? "ยกเลิกการประกาศผล" : "ประกาศผล"}
        </button>
      </div>
      <p className="form-hint">คะแนนจะบันทึกอัตโนมัติเมื่อกด “บันทึกคะแนน” · อันดับ/เหรียญด้านบนคือตัวอย่างจากคะแนนที่กรอก</p>
    </div>
  );
}
