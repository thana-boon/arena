"use client";
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  CompetitionSheet,
  COMP_DOC_TABS,
  type CompDocType,
  type SheetData,
} from "@/components/competition/CompetitionSheet";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function ReportsView({
  meta,
  criteria,
  fullScore,
  roster,
  results,
  backHref,
  printHref,
}: SheetData & {
  /** ปลายทางปุ่มย้อนกลับ — หน้าจัดการรายการที่เข้ามา (คงบริบท /teacher หรือ /admin) */
  backHref: string;
  /** หน้าพิมพ์ที่เปิดในแท็บใหม่ (ยังไม่รวม BASE — window.open ต้องเติมเอง) */
  printHref: string;
}) {
  const [tab, setTab] = useState<CompDocType>("roster");

  // เปิดเอกสารในแท็บใหม่แล้วค่อยเด้งหน้าต่างพิมพ์ที่นั่น — ปิดพลาดก็ไม่หลุดจากหน้านี้
  const exportDoc = () => window.open(`${BASE}${printHref}?doc=${tab}`, "_blank", "noopener");

  return (
    <div className="stack">
      <div className="no-print">
        <Link href={backHref} className="btn btn-ghost btn-sm">← กลับไปหน้ารายการแข่งขัน</Link>
      </div>
      <div className="no-print page-bar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>เอกสาร / รายงาน</h1>
          <div className="subtitle">{meta.competitionName}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={exportDoc}>
            <Icon name="printer" size={18} /> Export (เปิดแท็บใหม่)
          </button>
        </div>
      </div>

      <div className="no-print auth-tabs" style={{ maxWidth: 520 }}>
        {COMP_DOC_TABS.map((t) => (
          <button
            key={t.key}
            className={`auth-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <CompetitionSheet
          doc={tab}
          meta={meta}
          criteria={criteria}
          fullScore={fullScore}
          roster={roster}
          results={results}
        />
      </div>
    </div>
  );
}
