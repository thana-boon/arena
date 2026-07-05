"use client";
import { ConfirmProvider } from "@/components/ConfirmDialog";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
