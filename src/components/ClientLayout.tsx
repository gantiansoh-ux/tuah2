"use client";

import { AuthProvider } from "@/components/AuthProvider";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
