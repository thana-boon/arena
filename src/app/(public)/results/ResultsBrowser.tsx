"use client";
import { useState, useMemo, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { CompTypeBadge } from "@/components/CompTypeBadge";
import { CompResultTable } from "@/components/CompResultTable";
import type { PublicCompResult } from "@/lib/domain";

export function ResultsBrowser({
  groups,
  competitions,
}: {
  groups: { id: number; name: string }[];
  competitions: PublicCompResult[];
}) {
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState<number | "all">("all");

  // มาจากลิงก์ "เปิดในหน้าผลทั้งหมด" หรือลิงก์เก่าที่ส่งต่อกันไว้ (/results#comp-123)
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
              <CompResultTable comp={c} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
