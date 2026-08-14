import { uniqueEmail } from "../support/commands";

describe("plan dashboard (desktop viewport)", () => {
  beforeEach(() => {
    cy.viewport(1280, 800);
  });

  it("renders all dashboard widgets on desktop", () => {
    const email = uniqueEmail();
    cy.signupViaUi(email);
    cy.completeOnboarding();

    // All four manager tiles in a row.
    cy.contains("Income Manager").should("be.visible");
    cy.contains("Expense Manager").should("be.visible");
    cy.contains("Loan Manager").should("be.visible");
    cy.contains("Money Manager").should("be.visible");

    // Stats: net cashflow, runway, net worth.
    cy.contains("Net Cashflow").scrollIntoView().should("be.visible");
    cy.contains("Runway").scrollIntoView().should("be.visible");
    cy.contains("Net Worth").scrollIntoView().should("be.visible");

    // Month slider present — month abbreviation buttons render in the desktop timeline.
    cy.contains("Jan").should("exist");

    cy.screenshot("plan-desktop");
  });

  it("creates a new plan from the Create Plan modal", () => {
    const email = uniqueEmail();
    cy.signupViaUi(email);
    cy.completeOnboarding();

    cy.contains("+ Create Plan").click({ force: true });
    cy.get("input[placeholder='Plan title']").type("My Second Plan");
    cy.get("input[placeholder='Monthly income']").type("60000");
    cy.get("input[placeholder='Monthly expense']").type("25000");
    cy.get("input[placeholder='Runway (months)']").type("6");
    // Click the submit button inside the modal (not the header "+ Create Plan").
    cy.get("div[role='dialog'], .modal, [class*='Modal']").find("button").contains("Create Plan").click({ force: true });

    cy.contains("My Second Plan").should("be.visible");
    cy.screenshot("create-plan");
  });
});
