"use client";
import { useState, useMemo, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { CompTypeBadge } from "@/components/CompTypeBadge";
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
  groupId: number | null;
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

  // มาจากลิงก์ "ดูผลรายการนี้" ที่หน้าแรก (/results#comp-123)
  // หน้านี้เป็น dynamic + มี loading.tsx คั่น ตอนที่เบราว์เซอร์เลื่อนตาม hash การ์ดยังไม่มีในหน้า
  // เลยค้างอยู่บนสุด — จึงต้องเลื่อนเองอีกรอบหลังการ์ดขึ้นจริง
  useEffect(() => {
    const jumpToHash = () => {
      const id = window.location.hash.slice(1);
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        el.classList.add("is-target");
      });
    };
    jumpToHash();
    window.addEventListener("hashchange", jumpToHash);
    return () => window.removeEventListener("hashchange", jumpToHash);
  }, []);

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
        {/* filter-bar = ช่องค้นหา/ตัวกรองยืดเต็มจอบนมือถือแทนที่จะค้างที่ 280px */}
        <div className="filter-bar">
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
            <div className="card comp-result-card" key={c.id} id={`comp-${c.id}`}>
              <div className="row between mb-2">
                <h3 style={{ margin: 0 }}>{c.name}</h3>
                <CompTypeBadge type={c.type} size="sm" />
              </div>
              <div className="text-sm muted mb-4">
                ระดับ {c.levels.join(", ") || "-"} · คะแนนเต็ม {c.fullScore}
              </div>
              {!c.results.length ? (
                <div className="alert alert-info">ยังไม่มีการประกาศผลของรายการนี้</div>
              ) : (
                <div className="table-wrap table-cards">
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
                          <td className={`${medalClass[r.medal]} hide-sm`} style={{ fontWeight: 700 }}>{r.rank}</td>
                          {/* มือถือ: อันดับย้ายมานำหน้าชื่อ (คอลัมน์ซ้ายถูกซ่อน) */}
                          <td className="td-title">
                            <span className={`only-sm ${medalClass[r.medal]}`}>อันดับ {r.rank} · </span>
                            {c.type === "team" && r.teamName && <div style={{ fontWeight: 600 }}>{r.teamName}</div>}
                            <div className="text-sm" style={{ fontWeight: 400 }}>
                              {r.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}
                            </div>
                          </td>
                          <td className="num" data-label="คะแนน">{r.total.toFixed(2)}</td>
                          <td className="num" data-label="ร้อยละ">{r.percent.toFixed(1)}%</td>
                          <td data-label="เหรียญ"><span className={`badge ${medalBadge[r.medal]}`}>{r.medalLabel}</span></td>
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
