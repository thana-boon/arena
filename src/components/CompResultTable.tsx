"use client";
import { MEDAL_BADGE_CLASS, type PublicCompResult } from "@/lib/domain";
import { BrandLogo } from "@/components/BrandLogo";

/**
 * สีของ "อันดับ" ผูกกับโพเดียม 1-2-3 ไม่ใช่กับเหรียญ — เดิมระบายตามเหรียญ ทำให้รายการที่
 * ทุกคนได้เหรียญทอง ขึ้น "อันดับ 4" เป็นสีทองจนดูเหมือนที่ 1 ในภาพที่นักเรียนแคปไปลงสตอรี่
 * เหรียญยังบอกด้วยป้ายทางขวาเหมือนเดิม สองอย่างนี้จึงอ่านแยกกันได้
 */
function podiumClass(rank: number) {
  return rank <= 3 ? `podium podium-${rank}` : "";
}

/**
 * ตารางผลของ 1 รายการ — ใช้ร่วมกันระหว่างหน้าผลรวม (/results) กับกล่องดูผลที่หน้าแรก
 * จะได้ไม่ต้องแก้สองที่ทุกครั้งที่เปลี่ยนคอลัมน์
 *
 * eventName/yearBe ใช้ทำ "ลายเซ็น" ท้ายตาราง — นักเรียนแคปเฉพาะการ์ดผลไปลงสตอรี่
 * แถบบนที่มีชื่อระบบจึงถูก crop ทิ้งเสมอ ชื่อแบรนด์ต้องอยู่ในตัวการ์ดถึงจะติดไปด้วย
 */
export function CompResultTable({
  comp,
  eventName,
  yearBe,
}: {
  comp: PublicCompResult;
  eventName?: string | null;
  yearBe?: number | null;
}) {
  if (!comp.results.length) {
    return <div className="alert alert-info">ยังไม่มีการประกาศผลของรายการนี้</div>;
  }
  const meta = [eventName, yearBe ? `ปีการศึกษา ${yearBe}` : null].filter(Boolean).join(" · ");
  return (
    <div className="result-block">
      <div className="table-wrap table-cards">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 72 }}>อันดับ</th>
              <th>{comp.type === "team" ? "ทีม / สมาชิก" : "ผู้เข้าแข่งขัน"}</th>
              <th className="num">คะแนน</th>
              <th className="num">ร้อยละ</th>
              <th>เหรียญ</th>
            </tr>
          </thead>
          <tbody>
            {comp.results.map((r) => (
              <tr key={r.entryId} className={podiumClass(r.rank)}>
                <td className="hide-sm rank-cell">
                  <span className="rank-pill">{r.rank}</span>
                </td>
                {/* มือถือ: อันดับย้ายมานำหน้าชื่อ (คอลัมน์ซ้ายถูกซ่อน) */}
                <td className="td-title">
                  {/* มือถือ: อันดับขึ้นบรรทัดของตัวเอง จึงไม่ต้องมีตัวคั่น "·" ห้อยท้าย */}
                  <span className="only-sm rank-line">
                    <span className="rank-pill">{r.rank}</span>
                    <span className="rank-word">อันดับ {r.rank}</span>
                  </span>
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

      {/* ลายเซ็นท้ายผล — ติดไปกับทุกภาพที่แคป ไม่ว่าจะครอบตรงไหน */}
      <div className="result-signature">
        <BrandLogo size={20} />
        <span className="rs-brand">
          Su<span className="rs-k">K</span>hon <span className="rs-arena">Arena</span>
          <span className="rs-sep">·</span>SchoolOS
        </span>
        {meta && <span className="rs-meta">{meta}</span>}
      </div>
    </div>
  );
}
