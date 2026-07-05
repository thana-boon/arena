import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: req("DATABASE_URL"),
  JWT_SECRET: req("JWT_SECRET"),
  TEACHER_API_BASE: process.env.TEACHER_API_BASE ?? "http://192.168.200.9/teacher-api",
  TEACHER_API_KEY: process.env.TEACHER_API_KEY ?? "",
  STUDENT_API_BASE: process.env.STUDENT_API_BASE ?? "http://192.168.200.9/students-api/v1",
  STUDENT_API_KEY_VERIFY: process.env.STUDENT_API_KEY_VERIFY ?? "",
  STUDENT_API_KEY_READ: process.env.STUDENT_API_KEY_READ ?? "",
};
