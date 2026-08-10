import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatThaiDate } from "@/lib/domain";
import type { SubEventCard } from "@/lib/substitutions";

/**
 * ชั้นแรกของหน้าเปลี่ยนตัว — เลือก "งาน" ก่อน
 * บอกสถานะช่วงเปลี่ยนตัวไว้บนการ์ดตั้งแต่หน้านี้ ครูจะได้ไม่ต้องกดเข้าไปถึงรายการแล้วเจอปุ่มเทา ๆ
 *
 * ใช้ร่วมกันสองมุม จึงรับ basePath มาเติมหน้า id เอง — ห้ามฮาร์ดโค้ด /teacher ที่นี่
 * (Link ของ Next เติม basePath ของแอป (/arena) ให้เองอยู่แล้ว อย่าเติมซ้ำ)
 */
export function SubEventGrid({
  events,
  basePath,
  orphanCount = 0,
  isAdmin = false,
}: {
  events: SubEventCard[];
  /** เส้นทางของหน้ารายการในงาน เช่น "/teacher/substitutions" */
  basePath: string;
  /** รายการที่ยังไม่ถูกจัดเข้างาน — เปลี่ยนตัวไม่ได้ เพราะช่วงเวลาอยู่ที่งาน */
  orphanCount?: number;
  /** admin เปลี่ยนได้ตลอด — ป้ายบนการ์ดจึงต้องบอกว่าสถานะที่เห็นไม่ได้ปิดกั้นตัวเขา */
  isAdmin?: boolean;
}) {
  if (!events.length) {
    return (
      <div className="stack">
        {orphanCount > 0 && <OrphanNote count={orphanCount} />}
        <div className="empty-state card">
          <Icon name="restore" size={44} className="empty-ico" />
          <p>ยังไม่มีงานที่มีรายการในความดูแลของท่าน</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {orphanCount > 0 && <OrphanNote count={orphanCount} />}
      {isAdmin && (
        <div className="alert alert-info">
          ท่านเป็นผู้ดูแลระบบ — เปลี่ยนตัวได้ทุกรายการตลอดเวลา แม้งานจะปิดการเปลี่ยนตัวไว้
          (ทุกครั้งถูกบันทึกไว้ทั้งในประวัติการเปลี่ยนตัวและบันทึกการใช้งาน)
        </div>
      )}
      <div className="grid-2 stagger">
        {events.map((e) => (
          <Link key={e.id} href={`${basePath}/${e.id}`} className="card">
            <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}>
              <h3 style={{ margin: 0 }}>{e.name}</h3>
              <Icon name="chevron" size={18} style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <span className="badge">{e.kind === "training" ? "อบรม" : "แข่งขัน"}</span>
              {e.window ? (
                <span className={e.window.open ? "badge badge-gold" : "badge badge-warning"}>
                  {e.window.label}
                </span>
              ) : (
                <span className="badge">ปิดการเปลี่ยนตัว</span>
              )}
              {e.eventDate && <span className="badge">{formatThaiDate(e.eventDate)}</span>}
            </div>
            <div className="subtitle mb-0" style={{ marginTop: 8 }}>
              {e.compCount} รายการ · เปลี่ยนตัวได้ตอนนี้ {e.openCount} รายการ
              {e.subCount > 0 && ` · เปลี่ยนไปแล้ว ${e.subCount} ครั้ง`}
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
      มี {count} รายการที่ยังไม่ถูกจัดเข้างาน — เปลี่ยนตัวไม่ได้ เพราะช่วงเวลาเปลี่ยนตัวเป็นของงาน
    </div>
  );
}
