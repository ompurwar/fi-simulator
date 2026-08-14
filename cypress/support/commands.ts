/** Custom Cypress commands. */

/** Create a unique test email. */
export function uniqueEmail(prefix = "cy"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@test.com`;
}

/** Sign up a fresh user through the UI and land on the given path. */
Cypress.Commands.add("signupViaUi", (email: string, password = "secret123") => {
  cy.visit("/login?mode=signup");
  // The carousel stage shows first — click "Sign Up" to reveal the form.
  cy.get("button").contains(/^Sign Up$/).first().click();
  cy.get('input[name="name"]').type("Cypress User");
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(password);
  cy.get('button[name="standard-log-signup"]').click();
  // After signup the app redirects to /onboarding.
  cy.url().should("include", "/onboarding", { timeout: 15000 });
});

/** Complete the onboarding wizard (8 stages) using default answers. */
Cypress.Commands.add("completeOnboarding", () => {
  // Stage 1: currency select (Combobox) — pick INR.
  cy.get("input[placeholder*='Search currency']").type("INR");
  cy.contains("INR").click();
  cy.contains("Next").click();

  // Stage 2: objective MCQ — Wealth Creation.
  cy.contains("Wealth Creation").click();
  cy.contains("Next").click();

  // Stage 3: monthly income.
  cy.get("input[type=number]").first().clear().type("50000");
  cy.contains("Next").click();

  // Stage 4: monthly expense.
  cy.get("input[type=number]").first().clear().type("20000");
  cy.contains("Next").click();

  // Stage 5: runway.
  cy.contains("6 Months").click();
  cy.contains("Next").click();

  // Stage 6: spender type.
  cy.contains("Planned").click();
  cy.contains("Next").click();

  // Stage 7: EMI dependency.
  cy.contains("Sometimes").click();
  cy.contains("Next").click();

  // Stage 8: beta opt-in.
  cy.contains("Yes I").click();
  cy.contains("Finish").click();

  cy.url().should("include", "/plan", { timeout: 20000 });
});
