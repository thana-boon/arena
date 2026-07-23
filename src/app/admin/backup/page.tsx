import { requireAdmin } from "@/lib/auth/guards";
import { listServerBackups } from "@/lib/backupFiles";
import { BackupRestore } from "./BackupRestore";

export const dynamic = "force-dynamic";

export default async function AdminBackupPage() {
  await requireAdmin();
  const files = await listServerBackups();
  return <BackupRestore initialFiles={files} />;
}
