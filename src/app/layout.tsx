import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Sukhon Arena · ระบบจัดการการแข่งขันทางวิชาการ",
  description: "ระบบรับสมัครและบันทึกผลการแข่งขันทางวิชาการ โรงเรียนสุคนธีรวิทย์",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+Thai:wght@400;600;700&family=Noto+Sans+Thai:wght@300;400;500;700&family=Sarabun:wght@300;400;500;700&family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
