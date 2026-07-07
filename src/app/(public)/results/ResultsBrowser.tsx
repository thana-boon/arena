"use client";
import { useState, useMemo } from "react";
import { Icon } from "@/components/Icon";
import type { Medal } from "@/lib/domain";

type Member = { studentCode: string; name: string; classLevel: string; classRoom: string };
type Result = {
  entryId: number;
  teamName: string | null;
  members: Member[];
  total: number;
  percent: number;
  medal: Medal;
  medalLabel: string;
  rank: number;
};
type Comp = {
  id: number;
  name: string;
  type: "individual" | "team";
  groupId: number;
  levels: string[];
  criteria: { id: number; name: string; max: number }[];
  fullScore: number;
  results: Result[];
};

const medalClass: Record<Medal, string> = {
  gold: "medal-gold",
  silver: "medal-silver",
  bronze: "medal-bronze",
  none: "muted",
};
const medalBadge: Record<Medal, string> = {
  gold: "badge-gold",
  silver: "badge-purple",
  bronze: "badge-warning",
  none: "badge",
};

export function ResultsBrowser({
  groups,
  competitions,
}: {
  groups: { id: number; name: string }[];
  competitions: Comp[];
}) {
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState<number | "all">("all");

  const filtered = useMemo(() => {
    return competitions.filter((c) => {
      if (groupId !== "all" && c.groupId !== groupId) return false;
      if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [competitions, q, groupId]);

  return (
    <>
      <div className="card mb-4">
        <div className="row">
          <input
            className="form-input"
            style={{ maxWidth: 280 }}
            placeholder="ค้นหาชื่อรายการ"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="form-select" style={{ maxWidth: 220 }} value={groupId} onChange={(e) => setGroupId(e.target.value === "all" ? "all" : Number(e.target.value))}>
            <option value="all">ทุกหมวดวิชา</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!filtered.length ? (
        <div className="empty-state card">
          <Icon name="search" size={44} className="empty-ico" />
          <p>ไม่พบรายการที่ค้นหา</p>
        </div>
      ) : (
        <div className="stack">
          {filtered.map((c) => (
            <div className="card" key={c.id} id={`comp-${c.id}`}>
              <div className="row between mb-2">
                <h3 style={{ margin: 0 }}>{c.name}</h3>
                <span className="badge badge-purple">{c.type === "team" ? "ประเภททีม" : "ประเภทเดี่ยว"}</span>
              </div>
              <div className="text-sm muted mb-4">
                ระดับ {c.levels.join(", ") || "-"} · คะแนนเต็ม {c.fullScore}
              </div>
              {!c.results.length ? (
                <div className="alert alert-info">ยังไม่มีการประกาศผลของรายการนี้</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>อันดับ</th>
                        <th>{c.type === "team" ? "ทีม / สมาชิก" : "ผู้เข้าแข่งขัน"}</th>
                        <th className="num">คะแนน</th>
                        <th className="num">ร้อยละ</th>
                        <th>เหรียญ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.results.map((r) => (
                        <tr key={r.entryId}>
                          <td className={medalClass[r.medal]} style={{ fontWeight: 700 }}>{r.rank}</td>
                          <td>
                            {c.type === "team" && r.teamName && <div style={{ fontWeight: 600 }}>{r.teamName}</div>}
                            <div className="text-sm">
                              {r.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}
                            </div>
                          </td>
                          <td className="num">{r.total.toFixed(2)}</td>
                          <td className="num">{r.percent.toFixed(1)}%</td>
                          <td><span className={`badge ${medalBadge[r.medal]}`}>{r.medalLabel}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
