/** Shared suggestions only: editor, UI and terminal preferences remain independent. */
import { useEffect } from "react";
import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import { call, commands, type SystemFontFamily } from "@/platform/ipc";

export type FontStatus = "idle" | "loading" | "ready" | "empty" | "error" | "browser";
export const bundledFonts: SystemFontFamily[] = [
  { name: "JetBrains Mono", monospace: true },
  { name: "Inter", monospace: false },
];
export function mergeFontFamilies(fonts: SystemFontFamily[]): SystemFontFamily[] {
  const unique = new Map<string, SystemFontFamily>();
  for (const font of [...fonts, ...bundledFonts]) {
    if (font.name.trim()) unique.set(font.name.toLocaleLowerCase(), font);
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export const useSystemFontStore = create<{ fonts: SystemFontFamily[]; status: FontStatus }>(() => ({
  fonts: bundledFonts,
  status: "idle",
}));
let pending: Promise<void> | null = null;
export function loadSystemFonts(refresh = false): Promise<void> {
  if (pending) return pending;
  if (!refresh && useSystemFontStore.getState().status !== "idle") return Promise.resolve();
  if (!isTauri()) {
    useSystemFontStore.setState({ status: "browser" });
    return Promise.resolve();
  }
  useSystemFontStore.setState({ status: "loading" });
  pending = call(commands.systemFonts(refresh))
    .then(
      (fonts) =>
        useSystemFontStore.setState({ fonts: mergeFontFamilies(fonts), status: fonts.length ? "ready" : "empty" }),
      () => useSystemFontStore.setState({ status: "error" }),
    )
    .finally(() => {
      pending = null;
    });
  return pending;
}
export function useSystemFonts() {
  const state = useSystemFontStore();
  useEffect(() => {
    void loadSystemFonts();
  }, []);
  return state;
}
