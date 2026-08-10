import { Icon } from "@/components/Icon";
import {
  registrationNotice,
  competitionEditNotice,
  type NamedRegWindowEvent,
  type NamedCompEditWindowEvent,
  type WindowNotice,
} from "@/lib/domain";

/** กล่องข้อความสถานะช่วงเวลา — หน้าตาเดียวกันทุกเรื่อง (รับสมัคร / ช่วงแก้รายการ) */
function NoticeBar({ n, note }: { n: WindowNotice; note?: string }) {
  return (
    <div className={`alert ${n.open ? "alert-info" : "alert-warning"} row`} style={{ gap: 10, alignItems: "flex-start" }}>
      <Icon name={n.open ? "clock" : "warning"} size={18} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong>{n.title}</strong>
        {n.detail && <div className="text-sm">{n.detail}</div>}
        {note && <div className="text-sm">{note}</div>}
      </div>
    </div>
  );
}

/**
 * แถบบอกสถานะรับสมัคร ขึ้นหัวหน้าจอตั้งแต่เปิดหน้า — ไม่ต้องกดเข้าไปเลือกรายการก่อนถึงจะรู้ว่าหมดเวลา
 * ใช้ร่วมกันทั้งหน้านักเรียน หน้าครูประจำชั้น และหน้าแอดมิน (ข้อความจึงตรงกันทุกที่)
 *
 * - ปิดรับ/หมดเวลา → แถบเหลือง พร้อมวันเวลาที่ปิด
 * - เปิดรับอยู่ + มีกำหนดปิด → แถบฟ้าเตือนเส้นตายไว้ล่วงหน้า (เปิดแบบไม่มีกำหนดปิด = ไม่ต้องแสดงอะไร)
 */
export function RegWindowNotice({
  events,
  note,
  showWhenOpen = true,
}: {
  events: NamedRegWindowEvent[];
  /** ข้อความต่อท้ายเฉพาะหน้า เช่น บอกแอดมินว่ายังสมัครให้ได้อยู่ */
  note?: string;
  /** false = แสดงเฉพาะตอนปิดรับ (หน้าที่มีที่บอกสถานะอยู่แล้ว) */
  showWhenOpen?: boolean;
}) {
  const n = registrationNotice(events);
  if (n.open && (!showWhenOpen || !n.detail)) return null;
  return <NoticeBar n={n} note={note} />;
}

/**
 * แถบบอกครูว่ายัง "สร้าง/แก้ไขรายการแข่งขัน" ได้ถึงเมื่อไหร่ — รู้ตั้งแต่เปิดหน้ารายการ
 * ไม่ต้องแสดงกับ admin เพราะ admin ไม่ติดช่วงเวลานี้
 */
export function CompEditWindowNotice({
  events,
  note,
  showWhenOpen = true,
}: {
  events: NamedCompEditWindowEvent[];
  note?: string;
  showWhenOpen?: boolean;
}) {
  const n = competitionEditNotice(events);
  if (n.open && (!showWhenOpen || !n.detail)) return null;
  return <NoticeBar n={n} note={note} />;
}
