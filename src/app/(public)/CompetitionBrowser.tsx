"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { CompTypeBadge } from "@/components/CompTypeBadge";
import { CompResultDialog } from "./CompResultDialog";

/** การ์ดหนึ่งรายการที่หน้าแรก — ข้อความจัดรูปมาจาก server แล้ว ฝั่งนี้แค่กรอง/แสดง */
export type PublicCompCard = {
  id: number;
  name: string;
  groupName: string;
  type: "team" | "individual";
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  levels: string;
  dateText: string | null;
  noContest: boolean;
};

export type PublicCompSection = { id: number; name: string; items: PublicCompCard[] };

/** งานหนึ่งมีได้ราวร้อยรายการ — เกินกว่านี้ค่อยเริ่มด้วยหมวดที่พับไว้ทั้งหมด */
const AUTO_OPEN_MAX = 20;

/**
 * รายการแข่งขันทั้งงานที่หน้าแรก — พิมพ์ค้นหาได้ และพับเก็บทีละหมวด
 * (งานจริงมีเป็นร้อยรายการ ถ้ากางหมดจะเลื่อนหากันยาวมาก)
 *
 * กำลังค้นหาอยู่ = กางทุกหมวดที่มีรายการตรงคำค้น โดยไม่แตะสถานะพับที่ผู้ใช้ตั้งไว้
 * พอลบคำค้น หมวดจะกลับไปพับ/กางตามเดิม
 */
export function CompetitionBrowser({
  sections,
  eventName,
  yearBe,
}: {
  sections: PublicCompSection[];
  eventName?: string | null;
  yearBe?: number | null;
}) {
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  // ค่าเริ่มต้นคำนวณจาก props เท่านั้น — server กับ client จึงได้ HTML ตรงกันตอน hydrate
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(() =>
    total > AUTO_OPEN_MAX ? Object.fromEntries(sections.map((s) => [s.id, true])) : {}
  );
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return sections;
    return sections
      .map((s) => ({
        ...s,
        // ค้นชื่อรายการเป็นหลัก แต่พิมพ์ชื่อหมวด (เช่น "คณิตศาสตร์") ก็ต้องเจอทั้งหมวด
        items: s.name.toLowerCase().includes(term)
          ? s.items
          : s.items.filter((c) => c.name.toLowerCase().includes(term) || c.levels.toLowerCase().includes(term)),
      }))
      .filter((s) => s.items.length);
  }, [sections, term]);

  const found = results.reduce((n, s) => n + s.items.length, 0);
  const allOpen = results.every((s) => !collapsed[s.id]);

  function toggleAll() {
    const next = { ...collapsed };
    for (const s of results) next[s.id] = allOpen;
    setCollapsed(next);
  }

  return (
    <>
      <div className="card mb-4">
        <div className="filter-bar">
          <input
            className="form-input"
            style={{ maxWidth: 320 }}
            placeholder="ค้นหาชื่อรายการ หรือชื่อหมวด"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="ค้นหารายการแข่งขัน"
          />
          {q && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQ("")}>
              ล้างคำค้น
            </button>
          )}
          {/* ระหว่างค้นหาทุกหมวดกางอยู่แล้ว ปุ่มนี้จึงไม่มีความหมาย */}
          {!term && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={toggleAll}>
              <Icon name="chevron" size={15} />
              {allOpen ? "พับทั้งหมด" : "กางทั้งหมด"}
            </button>
          )}
        </div>
        <div className="text-sm muted mt-2">
          {term ? `พบ ${found} รายการ จากทั้งหมด ${total} รายการ` : `ทั้งหมด ${total} รายการ`}
        </div>
      </div>

      {!results.length ? (
        <div className="empty-state card">
          <Icon name="search" size={44} className="empty-ico" />
          <p>ไม่พบรายการที่ค้นหา</p>
          <p className="text-sm">ลองพิมพ์เพียงบางส่วนของชื่อรายการ</p>
        </div>
      ) : (
        results.map((s) => {
          // ระหว่างค้นหาให้กางเสมอ ไม่งั้นพิมพ์แล้วเจอแต่หัวหมวดเปล่า ๆ
          const open = term ? true : !collapsed[s.id];
          const panelId = `home-group-${s.id}`;
          return (
            <section key={s.id} className={`stack home-group${open ? "" : " collapsed"}`} style={{ gap: "var(--space-3)" }}>
              <button
                type="button"
                className="group-head group-toggle"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setCollapsed((prev) => ({ ...prev, [s.id]: open }))}
                disabled={Boolean(term)}
              >
                <Icon name="book" size={16} />
                <h2>{s.name}</h2>
                <span className="n">{s.items.length} รายการ</span>
                <Icon name="chevron" size={18} className="group-caret" />
              </button>
              <div className="grid-3 stagger" id={panelId} hidden={!open}>
                {s.items.map((c) => (
                  <div key={c.id} className="card">
                    <div className="row between mb-2">
                      <span className="badge badge-purple">{c.groupName}</span>
                      <CompTypeBadge type={c.type} teamSizeMin={c.teamSizeMin} teamSizeMax={c.teamSizeMax} size="sm" />
                    </div>
                    <h3 style={{ fontSize: "var(--text-lg)" }}>{c.name}</h3>
                    <div className="text-sm muted">ระดับชั้น: {c.levels || "-"}</div>
                    {c.dateText && <div className="text-sm muted">วันแข่ง: {c.dateText}</div>}
                    {/* รายการที่ "ไม่มีการแข่งขัน" ไม่มีผลให้ดู — หน้า /results ก็ตัดออกอยู่แล้ว */}
                    {c.noContest ? (
                      <div className="text-sm muted mt-4">กิจกรรมนี้ไม่มีการแข่งขัน จึงไม่มีผลประกาศ</div>
                    ) : (
                      <CompResultDialog compId={c.id} compName={c.name} eventName={eventName} yearBe={yearBe} />
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
