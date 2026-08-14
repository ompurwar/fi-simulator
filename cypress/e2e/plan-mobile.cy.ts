import { uniqueEmail } from "../support/commands";

describe("plan dashboard (mobile viewport)", () => {
  beforeEach(() => {
    cy.viewport(390, 844); // iPhone 12-ish
  });

  it("renders the dashboard responsively after onboarding", () => {
    const email = uniqueEmail();
    cy.signupViaUi(email);
    cy.completeOnboarding();

    // Header visible (mobile uses the mobile plan switcher, not the desktop Listbox).
    cy.get("header").first().should("be.visible");

    // Plan title in the page body (the nav also has a plan switcher).
    cy.get("h1").contains("My first plan.").should("be.visible");

    // Manager tiles wrap into a 2-col grid on mobile.
    cy.contains("Income Manager").should("be.visible");
    cy.contains("Expense Manager").should("be.visible");

    // Wealth chart card renders.
    cy.contains("Wealth projection").should("be.visible");

    // Screenshot for visual reference.
    cy.screenshot("plan-mobile");
  });

  it("does not show horizontal scroll on mobile", () => {
    const email = uniqueEmail();
    cy.signupViaUi(email);
    cy.completeOnboarding();
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth).to.be.lessThan(
        win.document.documentElement.clientWidth + 1
      );
    });
  });
});
