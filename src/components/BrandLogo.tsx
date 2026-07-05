/**
 * โลโก้แบรนด์ SKDW Arena — เป้าธนูที่ขยับตลอดเวลา (วงนอกหมุน + จุดกลางเต้น + ลูกศรขยับ)
 * ทั้งหมดเป็น CSS animation ล้วน (ดู .brand-logo ใน globals.css) จึงใช้ใน server component ได้
 */
export function BrandLogo({ size = 30 }: { size?: number }) {
  return (
    <span className="brand-logo" aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <circle className="bl-ring bl-ring-outer" cx="20" cy="20" r="17" />
        <circle className="bl-ring" cx="20" cy="20" r="11" />
        <circle className="bl-dot" cx="20" cy="20" r="4.5" />
        <line className="bl-arrow" x1="27" y1="13" x2="33" y2="7" />
        <line className="bl-arrow" x1="31" y1="7" x2="33" y2="7" />
        <line className="bl-arrow" x1="33" y1="7" x2="33" y2="9" />
      </svg>
    </span>
  );
}
