import "server-only";
import { db } from "@/db";
import {
  certificatePresets,
  certificateSignaturePresets,
  certificateSignatures,
  certificateTemplates,
} from "@/db/schema";
import { asc, desc, eq, ne } from "drizzle-orm";
import {
  defaultLayout,
  parseLayout,
  parseSignatures,
  type CertLayout,
  type CertSignature,
  type Orientation,
} from "@/lib/certificateLayout";

/**
 * คลังแม่แบบเริ่มต้น + ลายเซ็นที่บันทึกไว้
 *
 * ทำไมต้องคัดลอกทั้งก้อน ไม่อ้างอิงแม่แบบต้นทาง: ใบที่ออกไปแล้วต้องนิ่ง — ถ้างานใหม่ชี้กลับไปที่
 * แม่แบบของงานเก่า พอมีคนไปแก้ดีไซน์งานเก่า (หรือลบงานทิ้ง) งานใหม่จะเปลี่ยนตาม/พังตาม
 * ที่เก็บในคลังจึงเป็น snapshot ของ layout + ผู้ลงนาม ณ วันที่กดบันทึก
 *
 * รูปภาพ (พื้นหลัง/ลายเซ็น) อ้างเป็น asset id ร่วมกัน — ไฟล์เดียวใช้ได้หลายงาน ไม่ต้องสำเนา
 * (asset ไม่เคยถูกลบอัตโนมัติ จึงไม่มีทางที่คลังจะชี้ไปที่รูปที่หายไป)
 */

export type CertPresetView = {
  id: number;
  name: string;
  description: string;
  orientation: Orientation;
  backgroundAssetId: number | null;
  layout: CertLayout;
  signatures: CertSignature[];
  isDefault: boolean;
  createdBy: string;
  updatedAt: Date;
};

const asOrientation = (v: string): Orientation => (v === "portrait" ? "portrait" : "landscape");

function toView(r: typeof certificatePresets.$inferSelect): CertPresetView {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    orientation: asOrientation(r.orientation),
    backgroundAssetId: r.backgroundAssetId,
    layout: parseLayout(r.layout),
    signatures: parseSignatures(r.signatures),
    isDefault: r.isDefault,
    createdBy: r.createdBy,
    updatedAt: r.updatedAt,
  };
}

/** แม่แบบเริ่มต้นทั้งหมด — ตัวที่ตั้งเป็นค่าเริ่มต้นอยู่บนสุดเสมอ */
export async function listCertPresets(): Promise<CertPresetView[]> {
  const rows = await db
    .select()
    .from(certificatePresets)
    .orderBy(desc(certificatePresets.isDefault), asc(certificatePresets.name));
  return rows.map(toView);
}

export async function getCertPreset(id: number): Promise<CertPresetView | null> {
  const rows = await db.select().from(certificatePresets).where(eq(certificatePresets.id, id)).limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

/** แม่แบบที่จะใช้ตั้งต้นให้งานใหม่ (null = ยังไม่ได้ตั้งไว้ → งานใหม่เริ่มจากใบเปล่าเหมือนเดิม) */
export async function getDefaultCertPreset(): Promise<CertPresetView | null> {
  const rows = await db
    .select()
    .from(certificatePresets)
    .where(eq(certificatePresets.isDefault, true))
    .limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

export type CertPresetInput = {
  name: string;
  description?: string;
  orientation: Orientation;
  backgroundAssetId: number | null;
  layout: CertLayout;
  signatures: CertSignature[];
  isDefault?: boolean;
};

/** มีค่าเริ่มต้นได้ตัวเดียว — ปลดของเดิมก่อนตั้งตัวใหม่ (ไม่มี constraint ใน DB จึงบังคับที่นี่) */
async function clearOtherDefaults(keepId: number) {
  await db
    .update(certificatePresets)
    .set({ isDefault: false })
    .where(ne(certificatePresets.id, keepId));
}

export async function createCertPreset(input: CertPresetInput, by: string): Promise<number> {
  const [row] = await db
    .insert(certificatePresets)
    .values({
      name: input.name,
      description: input.description ?? "",
      orientation: input.orientation,
      backgroundAssetId: input.backgroundAssetId,
      layout: JSON.stringify(input.layout),
      signatures: JSON.stringify(input.signatures),
      isDefault: input.isDefault ?? false,
      createdBy: by,
    })
    .returning({ id: certificatePresets.id });
  if (input.isDefault) await clearOtherDefaults(row.id);
  return row.id;
}

/** แก้ชื่อ/คำอธิบาย หรือย้ายธง "ค่าเริ่มต้น" มาที่ตัวนี้ (ดีไซน์ไม่ถูกแตะ) */
export async function updateCertPreset(
  id: number,
  patch: { name?: string; description?: string; isDefault?: boolean }
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (patch.name != null) set.name = patch.name;
  if (patch.description != null) set.description = patch.description;
  if (patch.isDefault != null) set.isDefault = patch.isDefault;
  if (Object.keys(set).length) {
    await db.update(certificatePresets).set(set).where(eq(certificatePresets.id, id));
  }
  if (patch.isDefault === true) await clearOtherDefaults(id);
}

export async function deleteCertPreset(id: number): Promise<void> {
  await db.delete(certificatePresets).where(eq(certificatePresets.id, id));
}

/** ดีไซน์ของแม่แบบหนึ่งในงาน (สำหรับ "บันทึกแบบนี้ไว้ใช้กับงานหน้า") */
export async function snapshotTemplate(
  templateId: number
): Promise<{ orientation: Orientation; backgroundAssetId: number | null; layout: CertLayout; signatures: CertSignature[] } | null> {
  const tpl = (
    await db.select().from(certificateTemplates).where(eq(certificateTemplates.id, templateId)).limit(1)
  )[0];
  if (!tpl) return null;
  const sigs = await db
    .select()
    .from(certificateSignatures)
    .where(eq(certificateSignatures.templateId, templateId))
    .orderBy(asc(certificateSignatures.sortOrder));
  return {
    orientation: asOrientation(tpl.orientation),
    backgroundAssetId: tpl.backgroundAssetId,
    layout: parseLayout(tpl.layout),
    signatures: sigs.map((s) => ({
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
  };
}

/**
 * ดีไซน์ตั้งต้นของแม่แบบใหม่ — ใช้แม่แบบเริ่มต้นที่ตั้งไว้ ถ้าไม่มีก็ใบเปล่าแบบเดิม
 * ใช้ทั้งตอนสร้างงานใหม่และตอนสร้าง "แบบ" เพิ่มในงานเดิม
 */
export async function seedDesign(): Promise<{
  orientation: Orientation;
  backgroundAssetId: number | null;
  layout: CertLayout;
  signatures: CertSignature[];
}> {
  const preset = await getDefaultCertPreset();
  if (!preset)
    return { orientation: "landscape", backgroundAssetId: null, layout: defaultLayout(), signatures: [] };
  return {
    orientation: preset.orientation,
    backgroundAssetId: preset.backgroundAssetId,
    layout: preset.layout,
    signatures: preset.signatures,
  };
}

/** เขียนแม่แบบใหม่ 1 แถวพร้อมผู้ลงนาม — ทางเข้าเดียวของทุกที่ที่สร้างแม่แบบ */
export async function insertTemplate(args: {
  eventId: number;
  name: string;
  isDefault: boolean;
  orientation: Orientation;
  backgroundAssetId: number | null;
  layout: CertLayout;
  signatures: CertSignature[];
}): Promise<number> {
  const [tpl] = await db
    .insert(certificateTemplates)
    .values({
      eventId: args.eventId,
      name: args.name,
      isDefault: args.isDefault,
      medalFilter: "",
      orientation: args.orientation,
      backgroundAssetId: args.backgroundAssetId,
      layout: JSON.stringify(args.layout),
    })
    .returning({ id: certificateTemplates.id });

  if (args.signatures.length) {
    await db.insert(certificateSignatures).values(
      args.signatures.map((s, i) => ({
        templateId: tpl.id,
        sortOrder: i,
        name: s.name,
        roleLabel: s.roleLabel,
        mode: s.mode,
        assetId: s.mode === "image" ? s.assetId : null,
        x: String(s.x),
        y: String(s.y),
        width: String(s.width),
        color: s.color,
        fontSize: String(s.fontSize),
        imageScale: String(s.imageScale),
      }))
    );
  }
  return tpl.id;
}

// ===== ลายเซ็นที่บันทึกไว้ =====

export type SigPresetView = {
  id: number;
  name: string;
  roleLabel: string;
  mode: "image" | "blank";
  assetId: number | null;
  color: string;
  fontSize: number;
  imageScale: number;
};

export async function listSignaturePresets(): Promise<SigPresetView[]> {
  const rows = await db
    .select()
    .from(certificateSignaturePresets)
    .orderBy(asc(certificateSignaturePresets.sortOrder), asc(certificateSignaturePresets.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    roleLabel: r.roleLabel,
    mode: r.mode === "blank" ? ("blank" as const) : ("image" as const),
    assetId: r.assetId,
    color: r.color,
    fontSize: Number(r.fontSize),
    imageScale: Number(r.imageScale),
  }));
}

export async function createSignaturePreset(
  input: Omit<SigPresetView, "id">,
  by: string
): Promise<number> {
  const [row] = await db
    .insert(certificateSignaturePresets)
    .values({
      name: input.name,
      roleLabel: input.roleLabel,
      mode: input.mode,
      assetId: input.mode === "image" ? input.assetId : null,
      color: input.color,
      fontSize: String(input.fontSize),
      imageScale: String(input.imageScale),
      createdBy: by,
    })
    .returning({ id: certificateSignaturePresets.id });
  return row.id;
}

export async function updateSignaturePreset(
  id: number,
  patch: Partial<Omit<SigPresetView, "id">>
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (patch.name != null) set.name = patch.name;
  if (patch.roleLabel != null) set.roleLabel = patch.roleLabel;
  if (patch.mode != null) set.mode = patch.mode;
  if (patch.assetId !== undefined) set.assetId = patch.assetId;
  if (patch.color != null) set.color = patch.color;
  if (patch.fontSize != null) set.fontSize = String(patch.fontSize);
  if (patch.imageScale != null) set.imageScale = String(patch.imageScale);
  if (!Object.keys(set).length) return;
  await db.update(certificateSignaturePresets).set(set).where(eq(certificateSignaturePresets.id, id));
}

export async function deleteSignaturePreset(id: number): Promise<void> {
  await db.delete(certificateSignaturePresets).where(eq(certificateSignaturePresets.id, id));
}
