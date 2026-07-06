"use client";
import { useEffect, useState } from "react";
import type { CompetitionsSummary as Summary } from "@/lib/listings";

// สรุปยอดรวม: รายการที่เปิด / ที่นั่ง / นักเรียน — ดูความเพียงพอรายชั้น (ตารางอยู่ใน popup)
export function CompetitionsSummary({ summary }: { summary: Summary }) {
  const { totalComps, totalSeats, totalRegistered, totalStudents, studentsError, levels } = summary;
  const [open, setOpen] = useState(false);

  // จำนวนชั้นที่ที่นั่งไม่พอ — โชว์บนปุ่มให้เห็นทันที
  const shortLevels = levels.filter((l) => (!studentsError || l.students > 0) && l.seats < l.students).length;

  // Esc = ปิด
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="stack">
      <div className="grid-4 stagger">
        <div className="stat-card">
          <div className="label">รายการแข่งขัน</div>
          <div className="value">{totalComps}</div>
        </div>
        <div className="stat-card">
          <div className="label">ที่นั่งเปิดรับทั้งหมด</div>
          <div className="value">{totalSeats.toLocaleString("th-TH")}</div>
        </div>
        <div className="stat-card">
          <div className="label">ลงทะเบียนแล้ว</div>
          <div className="value">{totalRegistered.toLocaleString("th-TH")}</div>
        </div>
        <div className="stat-card">
          <div className="label">นักเรียนทั้งหมด</div>
          <div className="value">{studentsError ? "–" : totalStudents.toLocaleString("th-TH")}</div>
        </div>
      </div>

      {studentsError && (
        <div className="alert alert-warning">ดึงจำนวนนักเรียนจากระบบทะเบียนไม่สำเร็จ — ข้อมูลนักเรียนอาจไม่ครบ</div>
      )}

      {levels.length > 0 && (
        <div className="row">
          <button className="btn btn-secondary" onClick={() => setOpen(true)}>
            📊 ดูความเพียงพอรายชั้น
            {shortLevels > 0 && (
              <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                {shortLevels} ชั้นที่นั่งไม่พอ
              </span>
            )}
          </button>
        </div>
      )}

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="ความเพียงพอรายชั้น"
            style={{ maxWidth: 680, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">ความเพียงพอรายชั้น</h3>
            <p className="muted text-sm mt-0 mb-4">เทียบจำนวนที่นั่งที่เปิดรับกับจำนวนนักเรียนในแต่ละระดับชั้น</p>

            <div className="table-wrap" style={{ overflow: "auto", flex: 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>ระดับชั้น</th>
                    <th className="num">นักเรียน</th>
                    <th className="num">รายการที่รับ</th>
                    <th className="num">ที่นั่งเปิดรับ</th>
                    <th className="num">ส่วนต่าง</th>
                    <th>ความเพียงพอ</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l) => {
                    const known = !studentsError || l.students > 0;
                    const diff = l.seats - l.students;
                    const enough = diff >= 0;
                    return (
                      <tr key={l.level}>
                        <td style={{ fontWeight: 500 }}>{l.level}</td>
                        <td className="num">{known ? l.students.toLocaleString("th-TH") : "–"}</td>
                        <td className="num">{l.comps}</td>
                        <td className="num">
                          {l.seats.toLocaleString("th-TH")}
                          {l.sharedSeats > 0 && <span className="muted"> *</span>}
                        </td>
                        <td className="num">{known ? `${diff > 0 ? "+" : ""}${diff.toLocaleString("th-TH")}` : "–"}</td>
                        <td>
                          {!known ? (
                            <span className="muted text-sm">—</span>
                          ) : enough ? (
                            <span className="badge badge-success">เพียงพอ</span>
                          ) : (
                            <span className="badge badge-warning">ขาด {Math.abs(diff).toLocaleString("th-TH")} ที่นั่ง</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {levels.some((l) => l.sharedSeats > 0) && (
              <p className="muted text-xs mt-2 mb-0">
                * ที่นั่งของรายการประเภททีมและเดี่ยวแบบรวมชั้น ใช้โควตาร่วมกันหลายระดับชั้น จึงถูกนับให้ทุกชั้นที่รายการนั้นรับ —
                ผลรวมรายชั้นจึงอาจมากกว่าที่นั่งเปิดรับทั้งหมด
              </p>
            )}

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setOpen(false)}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
