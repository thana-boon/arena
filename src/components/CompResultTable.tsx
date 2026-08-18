"use client";
import { MEDAL_BADGE_CLASS, type PublicCompResult } from "@/lib/domain";

const medalClass: Record<string, string> = {
  gold: "medal-gold",
  silver: "medal-silver",
  bronze: "medal-bronze",
  none: "muted",
};

/**
 * ตารางผลของ 1 รายการ — ใช้ร่วมกันระหว่างหน้าผลรวม (/results) กับกล่องดูผลที่หน้าแรก
 * จะได้ไม่ต้องแก้สองที่ทุกครั้งที่เปลี่ยนคอลัมน์
 */
export function CompResultTable({ comp }: { comp: PublicCompResult }) {
  if (!comp.results.length) {
    return <div className="alert alert-info">ยังไม่มีการประกาศผลของรายการนี้</div>;
  }
  return (
    <div className="table-wrap table-cards">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 60 }}>อันดับ</th>
            <th>{comp.type === "team" ? "ทีม / สมาชิก" : "ผู้เข้าแข่งขัน"}</th>
            <th className="num">คะแนน</th>
            <th className="num">ร้อยละ</th>
            <th>เหรียญ</th>
          </tr>
        </thead>
        <tbody>
          {comp.results.map((r) => (
            <tr key={r.entryId}>
              <td className={`${medalClass[r.medal]} hide-sm`} style={{ fontWeight: 700 }}>{r.rank}</td>
              {/* มือถือ: อันดับย้ายมานำหน้าชื่อ (คอลัมน์ซ้ายถูกซ่อน) */}
              <td className="td-title">
                <span className={`only-sm ${medalClass[r.medal]}`}>อันดับ {r.rank} · </span>
                {comp.type === "team" && r.teamName && <div style={{ fontWeight: 600 }}>{r.teamName}</div>}
                <div className="text-sm" style={{ fontWeight: 400 }}>
                  {r.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}
                </div>
              </td>
              <td className="num" data-label="คะแนน">{r.total.toFixed(2)}</td>
              <td className="num" data-label="ร้อยละ">{r.percent.toFixed(1)}%</td>
              <td data-label="เหรียญ"><span className={`badge ${MEDAL_BADGE_CLASS[r.medal]}`}>{r.medalLabel}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
