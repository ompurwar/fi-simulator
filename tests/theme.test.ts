import { describe, it, expect, beforeEach, vi } from "vitest";

// Set up browser mocks before importing theme module
const mockStorage: Record<string, string> = {};
const mockClassList = new Set<string>();

const mockDocumentElement = {
  classList: {
    add: (cls: string) => mockClassList.add(cls),
    remove: (cls: string) => mockClassList.delete(cls),
    contains: (cls: string) => mockClassList.has(cls),
  },
  className: "",
  style: {
    colorScheme: "",
  },
};

(globalThis as any).localStorage = {
  getItem: (k: string) => mockStorage[k] ?? null,
  setItem: (k: string, v: string) => {
    mockStorage[k] = v;
  },
  removeItem: (k: string) => {
    delete mockStorage[k];
  },
  clear: () => {
    for (const key in mockStorage) delete mockStorage[key];
  },
};

(globalThis as any).document = {
  documentElement: mockDocumentElement,
};

(globalThis as any).window = {
  matchMedia: (query: string) => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
};

import { setTheme, toggleTheme, THEME_INIT_SCRIPT } from "../src/lib/theme";

describe("Theme Manager", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    mockClassList.clear();
    mockDocumentElement.style.colorScheme = "";
  });

  it("sets dark theme and adds dark class to document", () => {
    setTheme("dark");
    expect(globalThis.localStorage.getItem("fi_theme")).toBe("dark");
    expect(mockDocumentElement.classList.contains("dark")).toBe(true);
    expect(mockDocumentElement.style.colorScheme).toBe("dark");
  });

  it("sets light theme and removes dark class from document", () => {
    setTheme("dark");
    expect(mockDocumentElement.classList.contains("dark")).toBe(true);

    setTheme("light");
    expect(globalThis.localStorage.getItem("fi_theme")).toBe("light");
    expect(mockDocumentElement.classList.contains("dark")).toBe(false);
    expect(mockDocumentElement.style.colorScheme).toBe("light");
  });

  it("toggles between dark and light themes", () => {
    setTheme("light");
    expect(mockDocumentElement.classList.contains("dark")).toBe(false);

    toggleTheme();
    expect(globalThis.localStorage.getItem("fi_theme")).toBe("dark");
    expect(mockDocumentElement.classList.contains("dark")).toBe(true);

    toggleTheme();
    expect(globalThis.localStorage.getItem("fi_theme")).toBe("light");
    expect(mockDocumentElement.classList.contains("dark")).toBe(false);
  });

  it("exports a valid anti-FOUC init script snippet", () => {
    expect(THEME_INIT_SCRIPT).toBeDefined();
    expect(THEME_INIT_SCRIPT).toContain("fi_theme");
    expect(THEME_INIT_SCRIPT).toContain('classList.add("dark")');
  });
});
