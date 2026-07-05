/** โครงหน้าจอระหว่างโหลด (fade shimmer) — ใช้ใน loading.tsx ของแต่ละ segment */
export function PageSkeleton() {
  return (
    <div className="stack" aria-hidden="true">
      <div className="skeleton title" />
      <div className="skeleton-card">
        <div className="skeleton line" style={{ width: "70%" }} />
        <div className="skeleton line" style={{ width: "92%" }} />
        <div className="skeleton line" style={{ width: "48%" }} />
      </div>
      <div className="skeleton-card">
        <div className="skeleton line" style={{ width: "60%" }} />
        <div className="skeleton line" style={{ width: "84%" }} />
        <div className="skeleton line" style={{ width: "40%" }} />
      </div>
    </div>
  );
}
