import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatThaiDate } from "@/lib/domain";
import type { CertIssueEventCard } from "@/lib/certIssuing";

/**
 * ชั้นแรกของหน้าออกเกียรติบัตร — เลือก "งาน" ก่อน
 * (รายการแข่งขันทั้งปีรวมกันเป็นร้อย ๆ การไล่หาในตารางเดียวบนมือถือแทบเป็นไปไม่ได้)
 *
 * ใช้ร่วมกันสองมุม จึงรับ basePath มาเติมหน้า id เอง — ห้ามฮาร์ดโค้ด /teacher ที่นี่
 * (Link ของ Next เติม basePath ของแอป (/arena) ให้เองอยู่แล้ว อย่าเติมซ้ำ)
 */

const STATUS_LABEL: Record<string, string> = {
  draft: "ยังตั้งค่าไม่เสร็จ",
  published: "พร้อมออกใบ",
  locked: "ออกใบแล้ว",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "badge",
  published: "badge-gold",
  locked: "badge-purple",
};

export function CertEventGrid({
  events,
  basePath,
  orphanCount = 0,
}: {
  events: CertIssueEventCard[];
  /** เส้นทางของหน้ารายละเอียดงาน เช่น "/teacher/certificates" */
  basePath: string;
  /** รายการที่ยังไม่ถูกจัดเข้างาน — เตือนไว้เฉย ๆ กดเข้าไปไม่ได้ */
  orphanCount?: number;
}) {
  if (!events.length) {
    return (
      <div className="stack">
        {orphanCount > 0 && <OrphanNote count={orphanCount} />}
        <div className="empty-state card">
          <Icon name="file" size={44} className="empty-ico" />
          <p>ยังไม่มีงานที่มีรายการในความดูแลของท่าน</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {orphanCount > 0 && <OrphanNote count={orphanCount} />}
      <div className="grid-2 stagger">
        {events.map((e) => (
          <Link key={e.id} href={`${basePath}/${e.id}`} className="card">
            <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}>
              <h3 style={{ margin: 0 }}>{e.name}</h3>
              <Icon name="chevron" size={18} style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <span className="badge">{e.kind === "training" ? "อบรม" : "แข่งขัน"}</span>
              <span className={STATUS_CLASS[e.status] ?? "badge"}>
                {STATUS_LABEL[e.status] ?? e.status}
              </span>
              {e.eventDate && <span className="badge">{formatThaiDate(e.eventDate)}</span>}
            </div>
            <div className="subtitle mb-0" style={{ marginTop: 8 }}>
              {e.compCount} รายการ · ออกได้แล้ว {e.readyCount} รายการ
              {e.issuedCount > 0 && ` · ออกไปแล้ว ${e.issuedCount} ใบ`}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function OrphanNote({ count }: { count: number }) {
  return (
    <div className="alert alert-info">
      มี {count} รายการที่ยังไม่ถูกจัดเข้างาน — ออกเกียรติบัตรไม่ได้จนกว่าผู้ดูแลระบบจะจัดเข้างานให้
    </div>
  );
}
