"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/confirm";
import { AppShell } from "@/components/shell";
import { AuthProvider } from "@/lib/data/auth";
import { DataProvider } from "@/lib/data/store";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DataProvider>
        <ConfirmProvider>
          <AppShell>{children}</AppShell>
        </ConfirmProvider>
      </DataProvider>
    </AuthProvider>
  );
}
