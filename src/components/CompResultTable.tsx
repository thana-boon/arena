"use client";
import { useEffect, useRef, useState } from "react";
import { MEDAL_BADGE_CLASS, type PublicCompResult } from "@/lib/domain";
import { BrandLogo } from "@/components/BrandLogo";
import { Icon } from "@/components/Icon";

/**
 * สีของ "อันดับ" ผูกกับโพเดียม 1-2-3 ไม่ใช่กับเหรียญ — เดิมระบายตามเหรียญ ทำให้รายการที่
 * ทุกคนได้เหรียญทอง ขึ้น "อันดับ 4" เป็นสีทองจนดูเหมือนที่ 1 ในภาพที่นักเรียนแคปไปลงสตอรี่
 * เหรียญยังบอกด้วยป้ายทางขวาเหมือนเดิม สองอย่างนี้จึงอ่านแยกกันได้
 */
function podiumClass(rank: number) {
  return rank <= 3 ? `podium podium-${rank}` : "";
}

/** ชิ้นกระดาษของเอฟเฟกต์แสดงความยินดี — กำหนดปลายทาง/องศา/สี/จังหวะไว้ตายตัว
 *  ไม่สุ่มตอน render เพราะค่าสุ่มฝั่งเซิร์ฟเวอร์กับฝั่งเบราว์เซอร์จะไม่ตรงกัน (hydration พัง) */
const CONFETTI = [
  { x: -96, y: -34, r: -220, c: "var(--skdw-gold)", d: 0, w: 6, h: 10 },
  { x: -74, y: -46, r: 160, c: "var(--skdw-purple-light)", d: 60, w: 5, h: 9 },
  { x: -52, y: -30, r: -140, c: "#e07b39", d: 20, w: 7, h: 7 },
  { x: -34, y: -50, r: 260, c: "var(--skdw-gold-dark)", d: 120, w: 5, h: 11 },
  { x: -16, y: -40, r: -200, c: "var(--skdw-purple)", d: 40, w: 6, h: 8 },
  { x: 0, y: -56, r: 180, c: "var(--skdw-gold)", d: 90, w: 5, h: 10 },
  { x: 18, y: -38, r: -260, c: "#e07b39", d: 10, w: 6, h: 9 },
  { x: 38, y: -52, r: 140, c: "var(--skdw-purple-light)", d: 140, w: 5, h: 8 },
  { x: 58, y: -32, r: -180, c: "var(--skdw-gold-dark)", d: 70, w: 7, h: 10 },
  { x: 80, y: -46, r: 240, c: "var(--skdw-purple)", d: 30, w: 5, h: 9 },
  { x: 104, y: -28, r: -160, c: "var(--skdw-gold)", d: 110, w: 6, h: 11 },
  { x: 126, y: -42, r: 200, c: "#e07b39", d: 160, w: 5, h: 8 },
];

/** เล่นครั้งเดียวแล้วถูกถอดออกจากหน้า — ไม่มีอะไรขยับค้างไว้ให้เครื่องนักเรียนแบก */
function Celebration() {
  return (
    <span className="cf-layer" aria-hidden="true">
      {CONFETTI.map((c, i) => (
        <i
          key={i}
          className="cf"
          style={
            {
              "--cf-x": `${c.x}px`,
              "--cf-y": `${c.y}px`,
              "--cf-r": `${c.r}deg`,
              background: c.c,
              width: c.w,
              height: c.h,
              animationDelay: `${c.d}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
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
  const topRef = useRef<HTMLTableRowElement>(null);
  const [celebrate, setCelebrate] = useState(false);

  /**
   * กระดาษพุ่งจะเล่นเฉพาะตอนแถวอันดับ 1 "เลื่อนมาถึงตา" และเล่นรอบเดียวแล้วถอดทิ้ง
   * หน้า /results มีหลายสิบรายการ ถ้าปล่อยให้ทุกใบเล่นพร้อมกันตอนโหลด มือถือจะกระตุก
   * (ฝั่งเซิร์ฟเวอร์ไม่กระทบ — ทั้งหมดเป็น CSS ที่วิ่งในเครื่องผู้ชม)
   */
  useEffect(() => {
    const el = topRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setCelebrate(true);
        timer = window.setTimeout(() => setCelebrate(false), 3400);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [comp.id]);

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
              <tr key={r.entryId} className={podiumClass(r.rank)} ref={r.rank === 1 ? topRef : undefined}>
                <td className="hide-sm rank-cell">
                  <span className="rank-pill">{r.rank}</span>
                </td>
                {/* มือถือ: อันดับย้ายมานำหน้าชื่อ (คอลัมน์ซ้ายถูกซ่อน) */}
                <td className="td-title">
                  {r.rank === 1 && celebrate && <Celebration />}
                  {/* มือถือ: อันดับขึ้นบรรทัดของตัวเอง จึงไม่ต้องมีตัวคั่น "·" ห้อยท้าย */}
                  <span className="only-sm rank-line">
                    <span className="rank-pill">{r.rank}</span>
                    <span className="rank-word">อันดับ {r.rank}</span>
                    {r.rank === 1 && <Icon name="trophy" size={17} className="rank-trophy" />}
                  </span>
                  {comp.type === "team" && r.teamName && <div style={{ fontWeight: 600 }}>{r.teamName}</div>}
                  <div className="text-sm" style={{ fontWeight: 400 }}>
                    {r.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}
                  </div>
                </td>
                <td className="num" data-label="คะแนน">{r.total.toFixed(2)}</td>
                <td className="num" data-label="ร้อยละ">{r.percent.toFixed(1)}%</td>
                <td data-label="เหรียญ"><span className={`badge ${MEDAL_BADGE_CLASS[r.medal]}`}>{r.medalLabel}</span></td>
                {/* ลายเซ็นจิ๋วประจำการ์ด — เห็นเฉพาะโหมดการ์ด (มือถือ) ซึ่งเป็นมุมที่ถูกแคปทีละใบ
                    ใช้ข้อความล้วน + จุดวงกลมที่วาดด้วย CSS จึงไม่เพิ่ม SVG ให้ทุกแถว */}
                <td className="td-sign only-sm">
                  <span className="rs-mini">SuKhon Arena · SchoolOS</span>
                </td>
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
