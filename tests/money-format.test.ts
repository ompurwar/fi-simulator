import { describe, expect, it } from "vitest";
import { FormatCompactMoney, FormatIndianCompact } from "@/lib/money";

describe("FormatIndianCompact", () => {
  it("uses Indian units: K / L / Cr / Ar / Kb", () => {
    expect(FormatIndianCompact(999)).toBe("999");
    expect(FormatIndianCompact(50000)).toBe("50K");
    expect(FormatIndianCompact(100000)).toBe("1L");
    expect(FormatIndianCompact(416448)).toBe("4.16L");
    expect(FormatIndianCompact(10000000)).toBe("1Cr");
    expect(FormatIndianCompact(125000000)).toBe("12.5Cr");
    expect(FormatIndianCompact(550000000)).toBe("55Cr");
    expect(FormatIndianCompact(2100000000)).toBe("2.1Ar");
    expect(FormatIndianCompact(100000000000)).toBe("1Kb");
  });

  it("never uses western B/T for INR amounts", () => {
    const cr = FormatIndianCompact(1500000000);
    const kb = FormatIndianCompact(9_000_000_000_00);
    expect(cr).not.toContain("B");
    expect(kb).not.toContain("T");
  });
});

describe("FormatCompactMoney", () => {
  it("INR → symbol + Indian units, others → Intl compact", () => {
    expect(FormatCompactMoney(12500000, "INR", "₹", "en-IN")).toBe("₹1.25Cr");
    const usd = FormatCompactMoney(12500000, "USD", "$", "en-US");
    expect(usd).toContain("$");
    expect(usd).not.toContain("Cr");
  });
});
