// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import { LanguageSwitcher } from "../LanguageSwitcher";

beforeEach(() => {
  void i18n.changeLanguage("en");
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("LanguageSwitcher", () => {
  it("renders EN and PL buttons", () => {
    renderWithI18n(<LanguageSwitcher currentLocale="en" />);
    expect(screen.getByTestId("lang-en")).toBeTruthy();
    expect(screen.getByTestId("lang-pl")).toBeTruthy();
  });

  it("marks the current locale button as active (en)", () => {
    renderWithI18n(<LanguageSwitcher currentLocale="en" />);
    const enBtn = screen.getByTestId("lang-en") as HTMLButtonElement;
    const plBtn = screen.getByTestId("lang-pl") as HTMLButtonElement;
    expect(enBtn.className).toContain("bg-purple-600");
    expect(plBtn.className).not.toContain("bg-purple-600");
  });

  it("marks the current locale button as active (pl)", () => {
    renderWithI18n(<LanguageSwitcher currentLocale="pl" />);
    const enBtn = screen.getByTestId("lang-en") as HTMLButtonElement;
    const plBtn = screen.getByTestId("lang-pl") as HTMLButtonElement;
    expect(plBtn.className).toContain("bg-purple-600");
    expect(enBtn.className).not.toContain("bg-purple-600");
  });

  it("does not trigger switch when clicking the already-active locale", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));
    renderWithI18n(<LanguageSwitcher currentLocale="en" />);
    screen.getByTestId("lang-en").click();
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
