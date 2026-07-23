import type { NextConfig } from "next";

// subpath ที่จะเสิร์ฟ — ค่าเริ่มต้นว่าง (เข้าที่ root "/" ได้เลย เหมาะกับ dev/Docker ในเครื่อง)
// prod หลัง reverse proxy: ตั้ง BASE_PATH=/arena ตอน build (proxy forward /arena/... มาที่ port นี้)
// หมายเหตุ: basePath ถูก bake ตอน build → ต้องกำหนด env ก่อน `next build` ไม่ใช่ตอน runtime
const BASE_PATH = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // basePath จะ prefix ทั้ง route ของเพจและ asset ใน /_next/static ให้อัตโนมัติ
  // แต่ "ไม่" เติมให้ fetch() ที่เขียน path ตรง ๆ → จึง expose ให้ฝั่ง client ผ่าน env นี้
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  // กัน bookmark เก่า: เมื่อเสิร์ฟใต้ /arena แล้ว root "/" จะไม่มีเพจ — เด้งไป BASE_PATH ให้
  // (basePath: false = rule นี้ match ที่ root จริง ๆ ไม่ถูก prefix อัตโนมัติ)
  async redirects() {
    if (!BASE_PATH) return [];
    return [
      { source: "/", destination: BASE_PATH, basePath: false as const, permanent: false },
    ];
  },
  reactStrictMode: true,
  serverExternalPackages: ["pg", "bcryptjs"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
