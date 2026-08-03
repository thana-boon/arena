import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: req("DATABASE_URL"),
  JWT_SECRET: req("JWT_SECRET"),
  // SchoolOS Public API (host ใหม่) — key เดียวหลาย scope (ดู API-KEYS.md)
  SCHOOLOS_API_BASE: (process.env.SCHOOLOS_API_BASE ?? "http://192.168.200.56:3002").replace(/\/+$/, ""),
  SCHOOLOS_API_KEY: process.env.SCHOOLOS_API_KEY ?? "",
};
