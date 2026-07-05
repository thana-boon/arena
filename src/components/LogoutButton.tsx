"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    await api.post("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
      onClick={logout}
      disabled={loading}
    >
      ออกจากระบบ
    </button>
  );
}
