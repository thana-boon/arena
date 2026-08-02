import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Arena - SchoolOS | โรงเรียนสุคนธรวิทย์",
  description: "ระบบรับสมัครและบันทึกผลการแข่งขันทางวิชาการ โรงเรียนสุคนธีรวิทย์",
};

/**
 * ผู้ใช้ส่วนใหญ่เข้าจากมือถือ
 * - viewportFit: cover ให้ env(safe-area-inset-*) มีค่าจริง (แถบเมนูล่างจะได้ไม่โดนแถบ home ทับ)
 * - ไม่ล็อก maximumScale ผู้ใช้ยังซูมอ่านเองได้
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=Sarabun:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
