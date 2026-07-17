import "server-only";
import { db, pool } from "@/db";
import {
  certificateAssets,
  certificateCounters,
  certificateEventCompetitions,
  certificateEvents,
  certificateIssues,
  certificateSignatures,
  certificateTemplates,
  competitions,
} from "@/db/schema";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import type { PoolClient } from "pg";
import type { Medal } from "@/lib/domain";
import {
  type CertBlock,
  type CertLayout,
  type CertRenderData,
  defaultLayout,
  formatSerial,
  parseLayout,
} from "@/lib/certificateLayout";

export {
  BLOCK_KINDS,
  BLOCK_LABEL,
  type BlockKind,
  type CertBlock,
  type CertLayout,
  type CertRenderData,
  defaultLayout,
  formatSerial,
  parseLayout,
} from "@/lib/certificateLayout";

/**
 * เกียรติบัตร — แกนกลาง
 *
 * โครง: งาน (certificate_events) เป็นเจ้าของทุกอย่าง
 *   งาน ─┬─ รายการแข่งขันที่อยู่ในงาน (unique ต่อ competition → รายการหนึ่งอยู่ได้งานเดียว)
 *        └─ แม่แบบ ─── ผู้ลงนาม
 *
 * เลขทะเบียนรูปแบบ "2569/0042" วิ่งต่อเนื่องทั้งปีการศึกษาข้ามงาน (ตัวเดินเลขอยู่ที่ certificate_counters)
 */

// ขนาดสูงสุดของไฟล์รูปจริง (ไบต์) ที่ยอมเก็บลง DB — เพดานกันพลาด client + กันยิง API ตรง
export const MAX_ASSET_BYTES = 3 * 1024 * 1024;

/**
 * ตรวจว่า base64 เป็นรูปจริงตาม mime ที่อ้าง (เช็ค magic bytes) + คืนจำนวนไบต์จริง
 * การย่อฝั่ง client เป็น UX ล้วน ใครยิง API ตรงก็ข้ามได้ จึงต้องตรวจซ้ำที่นี่
 */
export function validateImageBase64(
  data: string,
  mime: string
): { ok: true; bytes: number } | { ok: false; error: string } {
  let buf: Buffer;
  try {
    buf = Buffer.from(data, "base64");
  } catch {
    return { ok: false, error: "ข้อมูลรูปไม่ถูกต้อง" };
  }
  if (buf.length === 0) return { ok: false, error: "ไฟล์รูปว่าง" };
  if (buf.length > MAX_ASSET_BYTES) return { ok: false, error: "ไฟล์รูปใหญ่เกินไป (เกิน 3MB)" };

  const isWebp =
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP";
  const isPng =
    buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

  const matches =
    (mime === "image/webp" && isWebp) ||
    (mime === "image/png" && isPng) ||
    (mime === "image/jpeg" && isJpeg);
  if (!matches) return { ok: false, error: "ไฟล์ไม่ใช่รูปภาพที่รองรับ (WebP/PNG/JPEG)" };

  return { ok: true, bytes: buf.length };
}

export type CertTemplateView = {
  id: number;
  medalFilter: string;
  orientation: "landscape" | "portrait";
  layout: CertLayout;
  backgroundAssetId: number | null;
  signatures: {
    id: number;
    name: string;
    roleLabel: string;
    mode: "image" | "blank";
    assetId: number | null;
    x: number;
    y: number;
    width: number;
  }[];
};

/**
 * โหลดแม่แบบทั้งหมดของงาน (id + layout + ผู้ลงนาม + asset id) — ไม่โหลด base64 ของรูป
 * ใช้ทั้ง (1) resolve template ตอนออกใบ ซึ่งต้องการแค่ id และ (2) หน้า editor ซึ่งโหลดรูปผ่าน asset URL แยก
 * การพิมพ์ใช้ loadTemplatesForPrint ที่ฝัง data URI ต่างหาก
 */
export async function getEventTemplates(eventId: number): Promise<CertTemplateView[]> {
  const tpls = await db
    .select()
    .from(certificateTemplates)
    .where(eq(certificateTemplates.eventId, eventId))
    .orderBy(asc(certificateTemplates.medalFilter));
  if (!tpls.length) return [];

  const sigs = await db
    .select()
    .from(certificateSignatures)
    .where(
      inArray(
        certificateSignatures.templateId,
        tpls.map((t) => t.id)
      )
    )
    .orderBy(asc(certificateSignatures.sortOrder));

  return tpls.map((t) => ({
    id: t.id,
    medalFilter: t.medalFilter,
    orientation: t.orientation === "portrait" ? "portrait" : "landscape",
    layout: parseLayout(t.layout),
    backgroundAssetId: t.backgroundAssetId,
    signatures: sigs
      .filter((s) => s.templateId === t.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        roleLabel: s.roleLabel,
        mode: s.mode === "image" ? ("image" as const) : ("blank" as const),
        assetId: s.assetId,
        x: Number(s.x),
        y: Number(s.y),
        width: Number(s.width),
      })),
  }));
}

/**
 * เลือกแม่แบบสำหรับเหรียญหนึ่ง ๆ — หาแม่แบบเฉพาะเหรียญก่อน ไม่เจอค่อยใช้แม่แบบหลัก (medalFilter = "")
 * งานส่วนใหญ่มีแม่แบบเดียว ฟังก์ชันนี้จึงคืนตัวหลักเป็นปกติ
 */
export function resolveTemplate(tpls: CertTemplateView[], medal: Medal): CertTemplateView | null {
  return tpls.find((t) => t.medalFilter === medal) ?? tpls.find((t) => t.medalFilter === "") ?? null;
}

// ===== เลขทะเบียน =====

/**
 * จองเลขทะเบียนถัดไปของปี — ต้องรันใน transaction ที่ส่ง client เข้ามา
 *
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING ทำให้ Postgres ล็อกแถว counter ให้เอง:
 * ครูสองคนกด export พร้อมกัน คนที่สองจะรอ แล้วได้เลขถัดไป ไม่ใช่เลขเดียวกัน
 * (SELECT MAX(no)+1 ทำแบบนี้ไม่ได้ — สอง transaction อ่านค่าเดียวกันแล้วได้เลขชนกัน)
 *
 * ครั้งแรกของปี: ไม่มีแถว → insert last_no = 1 คืน 1
 * ครั้งถัดไป: ชน conflict → last_no = last_no + 1 คืนเลขที่เพิ่งเพิ่ม
 * ค่าที่ RETURNING คืนมาคือเลขที่จองได้พอดีทั้งสองกรณี
 */
async function allocateSerialNo(client: PoolClient, yearId: number): Promise<number> {
  const res = await client.query<{ last_no: number }>(
    `INSERT INTO certificate_counters (year_id, last_no) VALUES ($1, 1)
     ON CONFLICT (year_id) DO UPDATE SET last_no = certificate_counters.last_no + 1
     RETURNING last_no`,
    [yearId]
  );
  return Number(res.rows[0].last_no);
}

export type IssueTarget = {
  competitionId: number;
  entryId: number;
  studentCode: string;
  nameSnapshot: string;
  classSnapshot: string;
  teamName: string | null;
  competitionName: string;
  medal: Medal;
  rank: number;
  percent: number;
};

export type IssuedRow = {
  id: number;
  serialNo: string;
  verifyToken: string;
  studentCode: string;
  entryId: number;
  reused: boolean;
};

const newToken = () => randomBytes(12).toString("base64url"); // 16 ตัวอักษร สุ่มพอที่จะเดาไม่ได้

/**
 * ออกเกียรติบัตรเป็นชุด — idempotent: ใบที่เคยออกแล้วคืนเลขเดิม (นับ reprint_count เพิ่ม) ไม่จองเลขใหม่
 * ทั้งชุดอยู่ใน transaction เดียว: ถ้าพังกลางทาง เลขทะเบียนจะไม่ถูกเผาทิ้ง
 */
export async function issueCertificates(params: {
  yearId: number;
  yearBe: number;
  eventId: number;
  eventName: string;
  templates: CertTemplateView[];
  targets: IssueTarget[];
  issuedBy: string;
}): Promise<IssuedRow[]> {
  const { yearId, yearBe, eventId, eventName, templates, targets, issuedBy } = params;
  if (!targets.length) return [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out: IssuedRow[] = [];

    for (const t of targets) {
      const existing = await client.query(
        `SELECT id, serial_no, verify_token FROM certificate_issues
         WHERE competition_id = $1 AND entry_id = $2 AND student_code = $3`,
        [t.competitionId, t.entryId, t.studentCode]
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        await client.query(
          `UPDATE certificate_issues SET reprint_count = reprint_count + 1 WHERE id = $1`,
          [row.id]
        );
        out.push({
          id: row.id,
          serialNo: row.serial_no,
          verifyToken: row.verify_token,
          studentCode: t.studentCode,
          entryId: t.entryId,
          reused: true,
        });
        continue;
      }

      const tpl = resolveTemplate(templates, t.medal);
      if (!tpl) throw new Error("ยังไม่ได้ตั้งค่าแม่แบบเกียรติบัตรของงานนี้");

      const no = await allocateSerialNo(client, yearId);
      const serialNo = formatSerial(yearBe, no);
      const token = newToken();

      const ins = await client.query(
        `INSERT INTO certificate_issues
           (serial_no, verify_token, year_id, event_id, competition_id, entry_id, student_code,
            template_id, name_snapshot, class_snapshot, team_name_snapshot,
            competition_name_snapshot, event_name_snapshot, year_be_snapshot,
            medal, rank, percent, issued_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING id`,
        [
          serialNo, token, yearId, eventId, t.competitionId, t.entryId, t.studentCode,
          tpl.id, t.nameSnapshot, t.classSnapshot, t.teamName,
          t.competitionName, eventName, yearBe,
          t.medal, t.rank, String(t.percent), issuedBy,
        ]
      );

      out.push({
        id: ins.rows[0].id,
        serialNo,
        verifyToken: token,
        studentCode: t.studentCode,
        entryId: t.entryId,
        reused: false,
      });
    }

    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** ล็อกงานเมื่อออกใบแรก — admin ต้องกดปลดล็อกเองถ้าจะแก้ดีไซน์ (กันใบพิมพ์ซ้ำหน้าตาไม่ตรงกับใบที่แจกไปแล้ว) */
export async function lockEventIfNeeded(eventId: number): Promise<void> {
  await db
    .update(certificateEvents)
    .set({ status: "locked" })
    .where(and(eq(certificateEvents.id, eventId), eq(certificateEvents.status, "published")));
}

// ===== หน้าเลือกรายการแข่งขัน =====

/**
 * รายการแข่งขันที่เลือกเข้างานนี้ได้ = รายการในปี ที่ยังไม่ถูกงาน "อื่น" หยิบไป
 * (รายการของงานตัวเองต้องยังอยู่ในลิสต์ ไม่งั้นตอนแก้ไขงานจะเห็นเป็นช่องว่าง)
 */
export async function getSelectableCompetitions(yearId: number, eventId: number | null) {
  const takenRows = await db
    .select({ competitionId: certificateEventCompetitions.competitionId })
    .from(certificateEventCompetitions)
    .where(
      eventId == null
        ? undefined
        : sql`${certificateEventCompetitions.eventId} <> ${eventId}`
    );
  const taken = takenRows.map((r) => r.competitionId);

  const where = taken.length
    ? and(eq(competitions.yearId, yearId), notInArray(competitions.id, taken))
    : eq(competitions.yearId, yearId);

  return db.select().from(competitions).where(where).orderBy(asc(competitions.name));
}

/** งานที่ถือรายการแข่งขันนี้อยู่ (null = ยังไม่ถูกจัดเข้างานไหน → ครูยัง export ไม่ได้) */
export async function findEventForCompetition(competitionId: number) {
  const rows = await db
    .select({ event: certificateEvents })
    .from(certificateEventCompetitions)
    .innerJoin(certificateEvents, eq(certificateEvents.id, certificateEventCompetitions.eventId))
    .where(eq(certificateEventCompetitions.competitionId, competitionId))
    .limit(1);
  return rows[0]?.event ?? null;
}

// ===== โหลดข้อมูลสำหรับหน้าพิมพ์ =====

export type PrintCanvasTemplate = {
  orientation: "landscape" | "portrait";
  backgroundSrc: string | null;
  layout: CertLayout;
  signatures: {
    id: number;
    name: string;
    roleLabel: string;
    mode: "image" | "blank";
    x: number;
    y: number;
    width: number;
    imageSrc: string | null;
  }[];
};

const dataUri = (a: { mime: string; data: string } | null) =>
  a ? `data:${a.mime};base64,${a.data}` : null;

/** โหลดแม่แบบตาม id (ฝัง base64 เป็น data URI พร้อมส่งให้ CertificateCanvas) — สำหรับหน้าพิมพ์ */
export async function loadTemplatesForPrint(
  templateIds: number[]
): Promise<Map<number, PrintCanvasTemplate>> {
  const ids = [...new Set(templateIds)];
  const map = new Map<number, PrintCanvasTemplate>();
  if (!ids.length) return map;

  const tpls = await db.select().from(certificateTemplates).where(inArray(certificateTemplates.id, ids));
  const sigs = tpls.length
    ? await db
        .select()
        .from(certificateSignatures)
        .where(inArray(certificateSignatures.templateId, tpls.map((t) => t.id)))
        .orderBy(asc(certificateSignatures.sortOrder))
    : [];

  const assetIds = [...tpls.map((t) => t.backgroundAssetId), ...sigs.map((s) => s.assetId)].filter(
    (v): v is number => v != null
  );
  const assets = assetIds.length
    ? await db.select().from(certificateAssets).where(inArray(certificateAssets.id, assetIds))
    : [];
  const assetOf = (id: number | null) =>
    id == null ? null : assets.find((a) => a.id === id) ?? null;

  for (const t of tpls) {
    map.set(t.id, {
      orientation: t.orientation === "portrait" ? "portrait" : "landscape",
      backgroundSrc: dataUri(assetOf(t.backgroundAssetId)),
      layout: parseLayout(t.layout),
      signatures: sigs
        .filter((s) => s.templateId === t.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          roleLabel: s.roleLabel,
          mode: s.mode === "image" ? ("image" as const) : ("blank" as const),
          x: Number(s.x),
          y: Number(s.y),
          width: Number(s.width),
          imageSrc: s.mode === "image" ? dataUri(assetOf(s.assetId)) : null,
        })),
    });
  }
  return map;
}

/** โหลดใบเกียรติบัตรที่ออกแล้วตาม id (ตามลำดับที่ขอ) */
export async function getIssuesByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(certificateIssues)
    .where(inArray(certificateIssues.id, ids));
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** ตรวจสอบเกียรติบัตรจาก token (หน้า public /verify/[token]) */
export async function verifyCertificate(token: string) {
  const rows = await db
    .select()
    .from(certificateIssues)
    .where(eq(certificateIssues.verifyToken, token))
    .limit(1);
  return rows[0] ?? null;
}
