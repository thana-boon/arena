import type { NextConfig } from "next";

const BASE_PATH = "/arena";

const nextConfig: NextConfig = {
  // เสิร์ฟภายใต้ subpath /arena (reverse proxy ส่งต่อ path เต็ม /arena/... มาที่ port 3017)
  // basePath จะ prefix ทั้ง route ของเพจและ asset ใน /_next/static ให้อัตโนมัติ
  // แต่ "ไม่" เติมให้ fetch() ที่เขียน path ตรง ๆ → จึง expose ให้ฝั่ง client ผ่าน env นี้
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  reactStrictMode: true,
  serverExternalPackages: ["pg", "bcryptjs"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
