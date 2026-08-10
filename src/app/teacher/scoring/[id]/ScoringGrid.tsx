"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
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

  /**
   * คนที่ติ๊กว่า "ไม่มาแข่งขัน" (entry_members.id) — เก็บรายคน ไม่ใช่ทั้งทีม
   * เพราะทีมหนึ่งอาจมาไม่ครบ คนที่มาแข่งจริงยังต้องได้เกียรติบัตรตามผลของทีม
   */
  const [absent, setAbsent] = useState<Set<number>>(
    () => new Set(roster.flatMap((e) => e.members.filter((m) => m.absent).map((m) => m.memberId)))
  );
  const toggleAbsent = (memberId: number, on: boolean) =>
    setAbsent((prev) => {
      const next = new Set(prev);
      if (on) next.add(memberId);
      else next.delete(memberId);
      return next;
    });

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
    // ส่งรายชื่อ "ไม่มาแข่งขัน" ทั้งชุดไปพร้อมคะแนน — ติ๊กเพิ่ม/เอาติ๊กออกจบในปุ่มเดียว
    const res = await api.post(`/api/competitions/${competitionId}/scores`, {
      scores: payload,
      absentMemberIds: [...absent],
    });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setMsg({
      type: "success",
      text: absent.size
        ? `บันทึกเรียบร้อยแล้ว · ไม่มาแข่งขัน ${absent.size} คน (จะไม่ได้รับเกียรติบัตร)`
        : "บันทึกคะแนนเรียบร้อยแล้ว",
    });
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
    return <div className="empty-state card"><Icon name="clipboard" size={44} className="empty-ico" /><p>ยังไม่มีผู้ลงทะเบียนให้บันทึกคะแนน</p></div>;
  }

  return (
    <div className="stack">
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="table-wrap table-cards score-cards">
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
                  <td className="hide-sm" style={{ fontWeight: 700 }}>{ranked[e.entryId]}</td>
                  <td className="td-title">
                    <span className="only-sm badge badge-purple" style={{ marginRight: 6 }}>อันดับ {ranked[e.entryId]}</span>
                    {type === "team" && e.teamName && <div style={{ fontWeight: 600 }}>{e.teamName}</div>}
                    <div className="stack" style={{ gap: 2 }}>
                      {e.members.map((m) => {
                        const away = absent.has(m.memberId);
                        return (
                          <div key={m.memberId} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <span
                              className="text-sm"
                              style={away ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
                            >
                              {m.name} <span className="muted">({m.classLevel}/{m.classRoom})</span>
                            </span>
                            <label className="form-check text-xs" style={{ margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={away}
                                onChange={(ev) => toggleAbsent(m.memberId, ev.target.checked)}
                              />
                              <span className={away ? "" : "muted"}>ไม่มาแข่งขัน</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  {criteria.map((c) => (
                    <td key={c.id} className="num" data-label={`${c.name} (เต็ม ${c.max})`}>
                      <input
                        type="number" min={0} max={c.max} step="0.01" inputMode="decimal"
                        className="form-input score-input" style={{ textAlign: "right" }}
                        aria-label={`คะแนน ${c.name}`}
                        value={vals[key(e.entryId, c.id)] ?? ""}
                        onChange={(ev) => setVal(e.entryId, c.id, ev.target.value)}
                      />
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }} data-label={`รวม (${fullScore})`}>{total.toFixed(2)}</td>
                  <td className="num" data-label="%">{pct.toFixed(1)}%</td>
                  <td data-label="เหรียญ"><span className={`badge ${MEDAL_BADGE_CLASS[medal]}`}>{MEDAL_LABEL[medal]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="form-actions between">
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกคะแนน"}</button>
        <button className={`btn ${published ? "btn-ghost" : "btn-accent"}`} onClick={togglePublish} disabled={busy}>
          {published ? "ยกเลิกการประกาศผล" : "ประกาศผล"}
        </button>
      </div>
      <p className="form-hint">
        คะแนนจะบันทึกอัตโนมัติเมื่อกด “บันทึกคะแนน” · อันดับ/เหรียญด้านบนคือตัวอย่างจากคะแนนที่กรอก
        <br />
        ติ๊ก “ไม่มาแข่งขัน” ที่ชื่อคนที่ไม่ได้มา — คนนั้นจะไม่ได้รับเกียรติบัตร (ปกติได้ 0 คะแนนก็ยังได้ “เข้าร่วม”)
        ส่วนคะแนน/อันดับของทีมยังคิดตามเดิม และต้องกด “บันทึกคะแนน” เพื่อให้มีผล
      </p>
    </div>
  );
}
