import type { CompetitionsSummary as Summary } from "@/lib/listings";

// สรุปยอดรวม: รายการที่เปิด / ที่นั่ง / นักเรียน — ดูความเพียงพอรายชั้น
export function CompetitionsSummary({ summary }: { summary: Summary }) {
  const { totalComps, totalSeats, totalRegistered, totalStudents, studentsError, levels } = summary;
  const hasShared = levels.some((l) => l.sharedSeats > 0);

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
        <div className="alert alert-warning">ดึงจำนวนนักเรียนจากระบบทะเบียนไม่สำเร็จ — คอลัมน์นักเรียนอาจไม่ครบ</div>
      )}

      {levels.length > 0 && (
        <div className="card">
          <h3 className="mt-0 mb-2">ความเพียงพอรายชั้น</h3>
          <p className="muted text-sm mt-0 mb-4">เทียบจำนวนที่นั่งที่เปิดรับกับจำนวนนักเรียนในแต่ละระดับชั้น</p>
          <div className="table-wrap">
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
          {hasShared && (
            <p className="muted text-xs mt-2 mb-0">
              * ที่นั่งของรายการประเภททีมและเดี่ยวแบบรวมชั้น ใช้โควตาร่วมกันหลายระดับชั้น จึงถูกนับให้ทุกชั้นที่รายการนั้นรับ —
              ผลรวมรายชั้นจึงอาจมากกว่าที่นั่งเปิดรับทั้งหมด
            </p>
          )}
        </div>
      )}
    </div>
  );
}
