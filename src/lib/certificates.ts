import "server-only";
import { db, pool } from "@/db";
import {
  certificateAssets,
  certificateCounters,
  events,
  certificateIssues,
  certificateSignatures,
  certificateTemplates,
  competitions,
  entries,
  entryMembers,
} from "@/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import type { PoolClient } from "pg";
import { formatThaiDate, type CertAward, type Medal } from "@/lib/domain";
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
    color: string;
    fontSize: number;
    imageScale: number;
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
        color: s.color,
        fontSize: Number(s.fontSize),
        imageScale: Number(s.imageScale),
      })),
  }));
}

/**
 * ข้อมูลตัวอย่างของงานหนึ่ง สำหรับ preview ในหน้าออกแบบและใบทดลองพิมพ์
 *
 * ใช้ "ชื่อที่ยาวที่สุด" ของคนที่อยู่ในงานจริง ๆ เพื่อให้เห็นปัญหาชื่อล้นกรอบตั้งแต่ตอนออกแบบ
 * เลขทะเบียนตั้งเป็น 0000 ซึ่งตัวเดินเลขไม่มีวันแจก (เริ่มที่ 1) — ใบทดลองจึงไม่ถูกเข้าใจผิดว่าเป็นใบจริง
 */
export async function sampleRenderData(
  eventId: number,
  eventName: string,
  yearBe: number
): Promise<CertRenderData> {
  const comps = await db
    .select()
    .from(competitions)
    .where(eq(competitions.eventId, eventId))
    .orderBy(asc(competitions.name));

  let studentName = "เด็กหญิงตัวอย่าง นามสกุลยาวมากพอสมควร";
  let className = "ม.3/8";
  let competitionName = comps[0]?.name ?? "การแข่งขันตัวอย่าง";

  if (comps.length) {
    const entRows = await db
      .select({ id: entries.id, competitionId: entries.competitionId })
      .from(entries)
      .where(and(inArray(entries.competitionId, comps.map((c) => c.id)), eq(entries.status, "active")));
    if (entRows.length) {
      const members = await db
        .select()
        .from(entryMembers)
        .where(inArray(entryMembers.entryId, entRows.map((e) => e.id)));
      const longest = members.sort((a, b) => b.nameSnapshot.length - a.nameSnapshot.length)[0];
      if (longest) {
        studentName = longest.nameSnapshot;
        className = [longest.classLevelSnapshot, longest.classRoomSnapshot].filter(Boolean).join("/");
        const ent = entRows.find((e) => e.id === longest.entryId);
        const comp = comps.find((c) => c.id === ent?.competitionId);
        if (comp) competitionName = comp.name;
      }
    }
  }

  return {
    studentName,
    className,
    teamName: null,
    competitionName,
    eventName,
    medal: "gold",
    rank: 1,
    serialNo: formatSerial(yearBe, 0),
    verifyToken: "sample",
    dateText: formatThaiDate(new Date()),
  };
}

/**
 * URL ฐานสำหรับ QR — ต้องเป็น absolute เพื่อให้สแกนจากมือถือแล้วเปิดได้จริง
 * สร้างจาก host ที่ request วิ่งเข้ามา + basePath (ไม่ hardcode โดเมน เพราะขึ้นกับที่ deploy)
 */
export async function verifyBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${proto}://${host}${base}/verify`;
}

/**
 * เลือกแม่แบบสำหรับเหรียญหนึ่ง ๆ — หาแม่แบบเฉพาะเหรียญก่อน ไม่เจอค่อยใช้แม่แบบหลัก (medalFilter = "")
 * งานส่วนใหญ่มีแม่แบบเดียว ฟังก์ชันนี้จึงคืนตัวหลักเป็นปกติ
 */
export function resolveTemplate(tpls: CertTemplateView[], medal: CertAward): CertTemplateView | null {
  // "activity" ไม่มีแม่แบบเฉพาะ → ตกไปใช้แม่แบบหลักเสมอ (เหมือนงานที่มีแม่แบบเดียว)
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
  /** "activity" สำหรับรายการที่ไม่มีการแข่งขัน (ไม่มีอันดับ/รางวัล) */
  medal: CertAward;
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

export type UndoResult = {
  deleted: number;
  serials: string[];
  eventId: number | null;
  /** งานถูกปลดจาก locked กลับเป็น published เพราะไม่เหลือใบในงานเลย */
  eventUnlocked: boolean;
};

/**
 * ยกเลิกการออกเกียรติบัตรของรายการหนึ่ง — ลบใบทั้งล็อตทิ้งจริง ๆ ไม่ใช่ soft delete
 *
 * ทำไมต้องลบ ไม่ใช่ทำเครื่องหมาย "ยกเลิก": ครูกด "ออกเกียรติบัตร" เพื่อดูว่าใบจริงหน้าตาเป็นยังไงบ่อยมาก
 * ถ้าเก็บแถวไว้ ทุกครั้งที่ลองจะเผาเลขทะเบียนของโรงเรียนทิ้งถาวรและงานค้างสถานะ locked แก้ดีไซน์ไม่ได้
 * (ช่อง revoked_at ยังมีไว้สำหรับ "ใบจริงที่แจกไปแล้วแต่ต้องประกาศเป็นโมฆะ" ซึ่งคนละเรื่องกัน)
 *
 * สองอย่างที่ต้องคืนสภาพด้วย ไม่งั้นเรียกว่ายกเลิกไม่ได้จริง:
 *   1) ตัวเดินเลขทะเบียน — ถอยกลับไปเท่าเลขสูงสุดที่ยังเหลืออยู่จริงในปีนั้น
 *      ⚠ ต้องล็อกแถว counter ก่อนแตะอะไรทั้งสิ้น: ครูอีกคนที่กำลังจองเลขอยู่จะถูกบังคับให้รอ
 *      และใบที่เขา commit ไปก่อนหน้าจะถูกมองเห็นตอนหาค่า MAX (READ COMMITTED อ่านค่าล่าสุด
 *      หลังได้ล็อก) — ไม่งั้นเราถอยเลขทับใบที่เพิ่งออกไป แล้วใบถัดไปได้เลขซ้ำ
 *   2) สถานะงาน — ถ้าทั้งงานไม่เหลือใบเลย ปลด locked กลับเป็น published ให้ admin แก้แม่แบบต่อได้
 */
export async function undoIssuesForCompetition(competitionId: number): Promise<UndoResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rows = (
      await client.query<{ year_id: number; event_id: number; serial_no: string }>(
        `SELECT year_id, event_id, serial_no FROM certificate_issues
         WHERE competition_id = $1 ORDER BY id`,
        [competitionId]
      )
    ).rows;
    if (!rows.length) {
      await client.query("COMMIT");
      return { deleted: 0, serials: [], eventId: null, eventUnlocked: false };
    }

    // ใบของรายการเดียวอยู่ปีเดียวและงานเดียวเสมอ (มาจาก competition ตัวเดียวกัน)
    const yearId = rows[0].year_id;
    const eventId = rows[0].event_id;

    await client.query(`SELECT last_no FROM certificate_counters WHERE year_id = $1 FOR UPDATE`, [
      yearId,
    ]);

    await client.query(`DELETE FROM certificate_issues WHERE competition_id = $1`, [competitionId]);

    // เลขล่าสุดใหม่ = เลขสูงสุดที่ยังเหลือในปีนั้น (0 = ไม่เหลือใบเลย → ปีนี้เริ่มนับหนึ่งใหม่)
    // เลขที่อยู่กลาง ๆ ของช่วง (รายการอื่นออกใบคร่อมไว้) ถอยคืนไม่ได้ กลายเป็นเลขว่างตามจริง
    await client.query(
      `UPDATE certificate_counters SET last_no = COALESCE(
         (SELECT MAX(split_part(serial_no, '/', 2)::int) FROM certificate_issues WHERE year_id = $1), 0)
       WHERE year_id = $1`,
      [yearId]
    );

    const left = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM certificate_issues WHERE event_id = $1`,
      [eventId]
    );
    let eventUnlocked = false;
    if (Number(left.rows[0].n) === 0) {
      const upd = await client.query(
        `UPDATE events SET status = 'published' WHERE id = $1 AND status = 'locked'`,
        [eventId]
      );
      eventUnlocked = (upd.rowCount ?? 0) > 0;
    }

    await client.query("COMMIT");
    return { deleted: rows.length, serials: rows.map((r) => r.serial_no), eventId, eventUnlocked };
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
    .update(events)
    .set({ status: "locked" })
    .where(and(eq(events.id, eventId), eq(events.status, "published")));
}

/** งานที่รายการแข่งขันนี้สังกัด (null = ยังไม่ถูกจัดเข้างานไหน → ครูยัง export ไม่ได้) */
export async function findEventForCompetition(competitionId: number) {
  const rows = await db
    .select({ event: events })
    .from(competitions)
    .innerJoin(events, eq(events.id, competitions.eventId))
    .where(eq(competitions.id, competitionId))
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
    color: string;
    fontSize: number;
    imageScale: number;
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
          color: s.color,
          fontSize: Number(s.fontSize),
          imageScale: Number(s.imageScale),
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

// ===== เกียรติบัตรของนักเรียนเอง =====

export type MyCertificate = {
  id: number;
  serialNo: string;
  verifyToken: string;
  yearBe: number;
  eventName: string;
  competitionName: string;
  teamName: string | null;
  className: string;
  award: CertAward;
  rank: number;
  issuedAt: Date;
  revoked: boolean;
};

/**
 * ใบทั้งหมดของนักเรียนคนหนึ่ง ทุกปีการศึกษา — สำหรับหน้า "เกียรติบัตรของฉัน"
 *
 * อ่านจากทะเบียนของเราเองล้วน (snapshot ครบทุกอย่างที่พิมพ์ลงกระดาษ) จึงไม่ต้องแตะ SchoolOS
 * ส่วน "นักเรียนที่จบ/ลาออกแล้วต้องดูของตัวเองไม่ได้" ถูกกั้นตั้งแต่ชั้นล็อกอิน:
 * SchoolOS ไม่ยืนยันตัวตนให้คนที่ไม่ได้เรียนอยู่ (ดู studentLogin / fetchActiveStudent)
 * ศิษย์เก่าที่มาขอใบย้อนหลังจึงต้องให้ครู export ให้จากหน้าทะเบียนเกียรติบัตรแทน
 */
export async function getMyCertificates(studentCode: string): Promise<MyCertificate[]> {
  const rows = await db
    .select()
    .from(certificateIssues)
    .where(eq(certificateIssues.studentCode, studentCode))
    .orderBy(desc(certificateIssues.yearBeSnapshot), desc(certificateIssues.issuedAt));

  return rows.map((r) => ({
    id: r.id,
    serialNo: r.serialNo,
    verifyToken: r.verifyToken,
    yearBe: r.yearBeSnapshot,
    eventName: r.eventNameSnapshot,
    competitionName: r.competitionNameSnapshot,
    teamName: r.teamNameSnapshot,
    className: r.classSnapshot,
    award: r.medal as CertAward,
    rank: r.rank,
    issuedAt: r.issuedAt,
    revoked: r.revokedAt != null,
  }));
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
