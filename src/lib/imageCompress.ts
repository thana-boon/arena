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
  /** ตัดพื้นหลังขาวออกเป็นโปร่งใส (สำหรับลายเซ็นที่ถ่ายจากกระดาษ) */
  removeWhiteBg?: boolean;
  /** ค่าความสว่าง 0..255 ที่ถือว่า "ขาว" แล้วตัดออก (ค่าสูง = ตัดเฉพาะที่ขาวจัด) */
  whiteThreshold?: number;
};

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
  signature: { maxWidth: 600, maxHeight: 600, quality: 0.9, removeWhiteBg: false, whiteThreshold: 245 } as CompressOptions,
};

export function presetFor(kind: "background" | "signature"): CompressOptions {
  return { ...PRESETS[kind] };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("อ่านไฟล์รูปไม่ได้ กรุณาเลือกไฟล์รูปภาพ"));
    };
    img.src = url;
  });
}

/** ตัด pixel ที่สว่างเกิน threshold ให้โปร่งใส — ทำงานบน canvas ใน place */
function applyRemoveWhite(ctx: CanvasRenderingContext2D, w: number, h: number, threshold: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] >= threshold && d[i + 1] >= threshold && d[i + 2] >= threshold) {
      d[i + 3] = 0; // alpha = 0
    }
  }
  ctx.putImageData(img, 0, 0);
}

export async function compressImage(file: File, opts: CompressOptions): Promise<CompressResult> {
  const img = await loadImage(file);

  const scale = Math.min(1, opts.maxWidth / img.width, opts.maxHeight / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการประมวลผลรูปภาพ");
  ctx.drawImage(img, 0, 0, w, h);

  if (opts.removeWhiteBg) {
    applyRemoveWhite(ctx, w, h, opts.whiteThreshold ?? 245);
  }

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/webp", opts.quality)
  );
  if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");

  const buf = await blob.arrayBuffer();
  const data = base64FromBuffer(buf);
  return { mime: "image/webp", data, bytes: blob.size, width: w, height: h };
}

function base64FromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
