import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { Icon } from "@/components/Icon";
import { db } from "@/db";
import { auditLog, teacherRoles } from "@/db/schema";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import {
  AUDIT_GROUPS,
  actionBadgeClass,
  actionLabel,
  actionsMatching,
  parseAuditDetail,
} from "@/lib/auditActions";
import { AuditFilters } from "./AuditFilters";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

/** "YYYY-MM-DD" → Date เที่ยงคืนตามเวลาเครื่อง (คอนเทนเนอร์ตั้ง TZ=Asia/Bangkok ตรงกับที่ log บันทึกไว้) */
function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

type Params = {
  q?: string;
  action?: string;
  who?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const action = sp.action ?? "";
  const who = sp.who ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  // ชื่อครูจากสิทธิ์ที่มอบไว้ในระบบเรา — ไม่ยิง SchoolOS API ตรงนี้ เพราะดึงครูทั้งโรงเรียนกินเวลาหลายวินาที
  // และหน้านี้ต้องเปิดไว ๆ · รหัสที่ไม่มีชื่อจะแสดงเป็นรหัสเปล่าตามเดิม
  const roles = await db
    .select({ code: teacherRoles.teacherCode, name: teacherRoles.nameSnapshot })
    .from(teacherRoles);
  const nameOf = new Map(roles.filter((r) => r.name).map((r) => [r.code, r.name]));

  // ===== เงื่อนไขกรอง =====
  const conds: SQL[] = [];

  if (who) conds.push(eq(auditLog.who, who));

  if (action.startsWith("g:")) {
    const group = AUDIT_GROUPS.find((g) => g.key === action.slice(2));
    if (group) conds.push(inArray(auditLog.action, group.actions));
  } else if (action) {
    conds.push(eq(auditLog.action, action));
  }

  const fromDate = parseIsoDate(from);
  if (fromDate) conds.push(gte(auditLog.createdAt, fromDate));
  const toDate = parseIsoDate(to);
  if (toDate) {
    // "ถึงวันที่" = รวมทั้งวันนั้น → เทียบกับเที่ยงคืนของวันถัดไป
    const end = new Date(toDate);
    end.setDate(end.getDate() + 1);
    conds.push(lt(auditLog.createdAt, end));
  }

  if (q) {
    const like = `%${q}%`;
    // คำค้นเป็นภาษาไทยได้ — เทียบกับป้ายชื่อไทยของ action และชื่อครู แล้วแปลงกลับเป็นรหัสก่อนค้น
    const byAction = actionsMatching(q);
    const byName = roles.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())).map((r) => r.code);
    // ค้น IP ได้ตรง ๆ ด้วย (พิมพ์ "192.168.1." เพื่อไล่ดูว่าเครื่องวงนี้ทำอะไรไปบ้าง)
    const parts: SQL[] = [ilike(auditLog.detail, like), ilike(auditLog.who, like), ilike(auditLog.ip, like)];
    if (byAction.length) parts.push(inArray(auditLog.action, byAction));
    if (byName.length) parts.push(inArray(auditLog.who, byName));
    const combined = or(...parts);
    if (combined) conds.push(combined);
  }

  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const current = Math.min(page, totalPages);

  const [logs, actionRows, whoRows] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(PER_PAGE)
      .offset((current - 1) * PER_PAGE),
    // ตัวเลือกใน dropdown มาจากของที่มีอยู่จริงใน log ไม่ใช่รายการทั้งหมดที่ระบบรู้จัก
    db.selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(asc(auditLog.action)),
    db.selectDistinct({ who: auditLog.who }).from(auditLog).orderBy(asc(auditLog.who)),
  ]);

  const people = whoRows.map((r) => ({ code: r.who, name: nameOf.get(r.who) ?? "" }));
  const hasFilter = Boolean(q || action || who || from || to);

  /** ลิงก์เปลี่ยนหน้า โดยคงตัวกรองเดิมไว้ (Link เติม basePath ให้เอง ห้ามใส่ /arena ซ้ำ) */
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (action) params.set("action", action);
    if (who) params.set("who", who);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  };

  return (
    <div className="stack">
      <div className="page-header">
        <h1>รายงาน / บันทึกการทำงาน</h1>
        <div className="subtitle">
          บันทึกการกระทำสำคัญทั้งหมดในระบบ — กรองตามการกระทำ ผู้ทำ หรือช่วงวันที่
        </div>
      </div>

      <AuditFilters
        initial={{ q, action, who, from, to }}
        actions={actionRows.map((r) => r.action)}
        people={people}
      />

      <div className="row between">
        <div className="text-sm muted">
          {hasFilter ? "ตรงกับตัวกรอง" : "ทั้งหมด"} {total.toLocaleString("th-TH")} รายการ
          {totalPages > 1 && ` · หน้า ${current}/${totalPages}`}
        </div>
      </div>

      {!logs.length ? (
        <div className="empty-state card">
          <Icon name="log" size={44} className="empty-ico" />
          <p>{hasFilter ? "ไม่พบบันทึกที่ตรงกับตัวกรอง" : "ยังไม่มีบันทึก"}</p>
          {hasFilter && (
            <div className="subtitle">
              ลองขยายช่วงวันที่เป็น “ทั้งหมด” หรือเลือกการกระทำเป็น “ทั้งหมด”
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap table-cards">
            <table className="table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ผู้ทำ</th>
                  <th>IP</th>
                  <th>การกระทำ</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const name = nameOf.get(l.who);
                  const fields = parseAuditDetail(l.detail);
                  return (
                    <tr key={l.id}>
                      {/* มือถือ: ชื่อการกระทำเป็นหัวการ์ด เวลา/ผู้ทำ/รายละเอียดเรียงลงมา */}
                      <td className="text-sm nowrap hide-sm">
                        {new Date(l.createdAt).toLocaleString("th-TH")}
                      </td>
                      <td className="text-sm hide-sm">{name ?? l.who}</td>
                      {/* บันทึกเก่าก่อนมีคอลัมน์นี้ (และกรณี proxy ไม่ส่ง header) จะว่าง → ขีดแทน */}
                      <td className="text-sm nowrap hide-sm">{l.ip || "—"}</td>
                      <td className="td-title">
                        <span className={actionBadgeClass(l.action)}>{actionLabel(l.action)}</span>
                        <div className="only-sm text-xs muted" style={{ fontWeight: 400, marginTop: 4 }}>
                          {new Date(l.createdAt).toLocaleString("th-TH")} · {name ?? l.who}
                          {l.ip && ` · ${l.ip}`}
                        </div>
                      </td>
                      <td className="text-xs muted td-block" data-label="รายละเอียด">
                        {!fields.length ? (
                          "—"
                        ) : (
                          <div className="row" style={{ gap: 6, rowGap: 2 }}>
                            {fields.map((f, i) => (
                              <span key={i} style={{ whiteSpace: "nowrap" }}>
                                {f.label && <span>{f.label} </span>}
                                <span style={{ color: "var(--skdw-dark)" }}>{f.value}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="row between">
              {current > 1 ? (
                <Link className="btn btn-secondary btn-sm" href={pageHref(current - 1)}>
                  ← ก่อนหน้า
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm muted">
                หน้า {current}/{totalPages}
              </span>
              {current < totalPages ? (
                <Link className="btn btn-secondary btn-sm" href={pageHref(current + 1)}>
                  ถัดไป →
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
