import { StudentsBrowser } from "./StudentsBrowser";

export const dynamic = "force-dynamic";

export default function AdminStudentsPage() {
  return (
    <div className="stack">
      <div className="page-header">
        <h1>รายชื่อนักเรียน</h1>
        <div className="subtitle">ค้นหา/กรองรายชื่อนักเรียนจาก Student API</div>
      </div>
      <StudentsBrowser />
    </div>
  );
}
