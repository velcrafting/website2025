// Providers.tsx
"use client";
import { ToastProvider } from "@/components/ui/Toast"; // direct path, not the barrel
import { ThemeProvider } from "@/components/ui/ThemeProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </ToastProvider>
  );
}
