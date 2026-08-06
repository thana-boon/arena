"use client";

/**
 * ย่อรูป + แปลงเป็น WebP ฝั่ง client ก่อนอัปโหลด — ลดขนาดที่เก็บใน DB (ซึ่งพ่วงไปกับ backup ทุกครั้ง)
 *
 * ใช้ WebP ไม่ใช่ JPEG เพราะลายเซ็นต้องมีพื้นหลังโปร่งใส (JPEG ทำ alpha ไม่ได้ จะได้กล่องขาวทับพื้นหลังเกียรติบัตร)
 * WebP รองรับ alpha และเล็กกว่า PNG ~3-4 เท่า
 *
 * หมายเหตุ: การย่อฝั่ง client เป็นเรื่อง UX ไม่ใช่ security — เซิร์ฟเวอร์ต้องตรวจขนาด/ชนิดไฟล์ซ้ำอีกชั้นเสมอ
 */

export type CompressOptions = {
  maxWidth: number;
  maxHeight: number;
  quality: number; // 0..1
};

/** การปรับแต่งรูปลายเซ็น — ลบพื้นกระดาษ / เปลี่ยนสีหมึก / ตัดขอบว่าง */
export type SigTune = {
  /** ตัดพื้นหลังออกเป็นโปร่งใส (สำหรับลายเซ็นที่ถ่าย/สแกนจากกระดาษ) */
  removeBg: boolean;
  /** ความสว่าง 0..255 ที่ถือว่าเป็น "พื้นกระดาษ" — ยิ่งต่ำยิ่งลบเยอะ (กระดาษเทา/มีเงาต้องลดค่านี้) */
  bgLevel: number;
  /** สีหมึกใหม่ (null = คงสีเดิมในไฟล์) */
  ink: string | null;
  /** ตัดขอบว่างรอบลายเซ็นทิ้ง ให้ลายเซ็นเต็มกรอบ */
  trim: boolean;
};

/** ไฟล์ที่เพิ่งอัปโหลด — ส่วนใหญ่เป็นรูปถ่าย/สแกนจากกระดาษ จึงลบพื้น+ตัดขอบให้เลย */
export const SIG_TUNE_NEW: SigTune = { removeBg: true, bgLevel: 225, ink: null, trim: true };
/** รูปที่เคยผ่านหน้านี้แล้ว — พื้นโปร่งใสและตัดขอบไปแล้ว เปิดมาเพื่อเปลี่ยนสีเป็นหลัก */
export const SIG_TUNE_SAVED: SigTune = { removeBg: false, bgLevel: 225, ink: null, trim: false };

export const BG_LEVEL_MIN = 140;
export const BG_LEVEL_MAX = 252;

export type CompressResult = {
  mime: string;
  /** base64 ล้วน ไม่มี "data:...;base64," นำหน้า */
  data: string;
  bytes: number;
  width: number;
  height: number;
};

const PRESETS = {
  background: { maxWidth: 1754, maxHeight: 1754, quality: 0.85 } as CompressOptions, // A4 นอน ~150dpi
  signature: { maxWidth: 600, maxHeight: 600, quality: 0.9 } as CompressOptions,
};

export function presetFor(kind: "background" | "signature"): CompressOptions {
  return { ...PRESETS[kind] };
}

/** รับได้ทั้งไฟล์ที่เพิ่งเลือก และ URL ของรูปที่เก็บไว้แล้ว (same-origin เท่านั้น ไม่งั้น canvas อ่าน pixel ไม่ได้) */
function loadImage(src: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const revoke = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
    };
    const img = new Image();
    img.onload = () => {
      revoke();
      resolve(img);
    };
    img.onerror = () => {
      revoke();
      reject(new Error("อ่านไฟล์รูปไม่ได้ กรุณาเลือกไฟล์รูปภาพ"));
    };
    img.src = url;
  });
}

/** ย่อรูปลง canvas ใหม่ตามกรอบที่กำหนด */
function drawScaled(img: HTMLImageElement, opts: CompressOptions) {
  const scale = Math.min(1, opts.maxWidth / img.width, opts.maxHeight / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการประมวลผลรูปภาพ");
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

async function toWebp(canvas: HTMLCanvasElement, quality: number): Promise<CompressResult> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
  if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");
  const data = base64FromBuffer(await blob.arrayBuffer());
  return { mime: "image/webp", data, bytes: blob.size, width: canvas.width, height: canvas.height };
}

export async function compressImage(file: File, opts: CompressOptions): Promise<CompressResult> {
  const img = await loadImage(file);
  const { canvas } = drawScaled(img, opts);
  return toWebp(canvas, opts.quality);
}

// ===== ลายเซ็น =====

/** ต่ำกว่าความสว่างนี้ (เทียบเป็นสัดส่วนของ bgLevel) ถือว่าเป็นเส้นหมึกเต็มร้อย */
const INK_FULL_RATIO = 0.3;
/** ดันเส้นจาง ๆ ให้ทึบขึ้นเล็กน้อย — ปากกาหมึกซึมถ่ายด้วยมือถือมักออกมาเทา ไม่ดำสนิท */
const INK_GAMMA = 0.75;
/** ความเข้มขั้นต่ำที่นับว่าเป็น "ตัวลายเซ็น" ตอนหาขอบเพื่อตัดขอบว่าง */
const TRIM_MIN_INK = 0.06;

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * แยก "หมึก" ออกจาก "พื้นกระดาษ" ด้วยความสว่างของแต่ละ pixel แล้วคืนขอบเขตของลายเซ็น
 *
 * ค่าความเข้ม c (0..1) ทำหน้าที่เป็นทั้ง alpha ใหม่และน้ำหนักการผสมสี จึงได้ขอบเส้นที่ยัง
 * นุ่ม (anti-alias) ไม่แตกเป็นฟันเลื่อยแบบการตัดด้วย threshold ตรง ๆ
 */
export function applySigInk(d: Uint8ClampedArray, w: number, h: number, tune: SigTune): Bounds | null {
  const white = Math.min(BG_LEVEL_MAX, Math.max(BG_LEVEL_MIN, tune.bgLevel));
  const black = white * INK_FULL_RATIO;
  const ink = tune.ink ? hexToRgb(tune.ink) : null;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = d[i + 3] / 255;
      // ความสว่างเมื่อวางบนกระดาษขาว — pixel ที่โปร่งใสอยู่แล้วต้องนับเป็นพื้น ไม่ใช่หมึกดำ
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a);
      let c = (white - lum) / (white - black);
      c = c <= 0 ? 0 : c >= 1 ? 1 : Math.pow(c, INK_GAMMA);

      if (ink && c > 0) {
        // ลบพื้นแล้ว = ทาสีเต็มทุก pixel ที่เหลือ (alpha คุมความนุ่มของขอบให้อยู่แล้ว)
        // ยังไม่ลบพื้น = ผสมตามความเข้ม ไม่งั้นพื้นกระดาษจะกลายเป็นสีหมึกไปด้วย
        const f = tune.removeBg ? 1 : c;
        d[i] = Math.round(d[i] + (ink.r - d[i]) * f);
        d[i + 1] = Math.round(d[i + 1] + (ink.g - d[i + 1]) * f);
        d[i + 2] = Math.round(d[i + 2] + (ink.b - d[i + 2]) * f);
      }
      if (tune.removeBg) d[i + 3] = Math.round(d[i + 3] * c);

      if (c > TRIM_MIN_INK) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function cropTo(canvas: HTMLCanvasElement, b: Bounds): HTMLCanvasElement {
  const pad = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.02));
  const x = Math.max(0, b.x0 - pad);
  const y = Math.max(0, b.y0 - pad);
  const w = Math.min(canvas.width, b.x1 + pad + 1) - x;
  const h = Math.min(canvas.height, b.y1 + pad + 1) - y;
  if (w <= 0 || h <= 0) return canvas;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return out;
}

/** ประมวลผลรูปลายเซ็นตามที่ตั้งค่าไว้ แล้วคืนไฟล์ WebP พร้อมอัปโหลด (ใช้เป็นภาพตัวอย่างได้เลย) */
export async function compressSignature(src: File | string, tune: SigTune): Promise<CompressResult> {
  const opts = PRESETS.signature;
  const img = await loadImage(src);
  const { canvas, ctx, w, h } = drawScaled(img, opts);

  let out = canvas;
  if (tune.removeBg || tune.ink || tune.trim) {
    const px = ctx.getImageData(0, 0, w, h);
    const bounds = applySigInk(px.data, w, h, tune);
    ctx.putImageData(px, 0, 0);
    if (tune.trim && bounds) out = cropTo(canvas, bounds);
  }
  return toWebp(out, opts.quality);
}

/** data URI สำหรับแสดงผลลัพธ์ที่ได้จาก compress* โดยตรง */
export const resultDataUri = (r: CompressResult) => `data:${r.mime};base64,${r.data}`;

function base64FromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
