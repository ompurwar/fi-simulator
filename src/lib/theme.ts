"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "fi_theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "light" || val === "dark" || val === "system") return val;
  } catch {}
  return "system";
}

let currentTheme: Theme = "system";
let listeners: Array<() => void> = [];

function emitChange() {
  listeners.forEach((l) => l());
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = theme === "dark" || (theme === "system" && getSystemTheme() === "dark");

  if (isDark) {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

export function setTheme(theme: Theme) {
  currentTheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
  emitChange();
}

export function toggleTheme() {
  const current = getStoredTheme();
  if (current === "dark") {
    setTheme("light");
  } else if (current === "light") {
    setTheme("dark");
  } else {
    const resolved = getSystemTheme();
    setTheme(resolved === "dark" ? "light" : "dark");
  }
}

export function useTheme() {
  const [mounted, setMounted] = useState(false);

  const theme = useSyncExternalStore(
    (callback) => {
      listeners.push(callback);
      return () => {
        listeners = listeners.filter((l) => l !== callback);
      };
    },
    () => (typeof window !== "undefined" ? getStoredTheme() : "system"),
    () => "system"
  );

  useEffect(() => {
    setMounted(true);
    currentTheme = getStoredTheme();
    applyTheme(currentTheme);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
        emitChange();
      }
    };

    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, []);

  const resolvedTheme: ResolvedTheme =
    !mounted
      ? "light"
      : theme === "system"
      ? getSystemTheme()
      : theme;

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    mounted,
  };
}

export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem("${STORAGE_KEY}");
    var isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches) || (stored === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    }
  } catch (e) {}
})();
`.trim();
