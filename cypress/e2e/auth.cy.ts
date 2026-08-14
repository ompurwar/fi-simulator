import { uniqueEmail } from "../support/commands";

describe("auth flow", () => {
  it("shows the login page with carousel and action buttons", () => {
    cy.visit("/login");
    // The carousel stage shows "Sign Up" / "Sign In" buttons.
    cy.get("button").contains("Sign Up").should("be.visible");
    cy.get("button").contains("Sign In").should("be.visible");
  });

  it("switches between login and signup modes", () => {
    cy.visit("/login");
    // Click "Sign Up" to enter the signup form.
    cy.get("button").contains("Sign Up").first().click();
    cy.get('input[name="name"]').should("be.visible");
    cy.get('button[name="standard-log-signup"]').should("contain", "Sign Up");
  });

  it("signs up a new user and completes onboarding to reach the plan dashboard", () => {
    const email = uniqueEmail();
    cy.signupViaUi(email);
    cy.completeOnboarding();
    // Dashboard should show the plan and manager tiles.
    cy.contains("Income Manager").should("be.visible");
    cy.contains("Expense Manager").should("be.visible");
    cy.contains("My first plan.").should("be.visible");
  });

  it("logs out and returns to login", () => {
    const email = uniqueEmail();
    cy.signupViaUi(email);
    cy.completeOnboarding();
    // Profile menu → Log Out (hidden inside the Popover until opened).
    cy.get("button").contains("cypress").first().click({ force: true });
    cy.contains("Log Out").should("be.visible").click();
    cy.url().should("include", "/login");
  });

  it("rejects an invalid login with a toast", () => {
    cy.visit("/login");
    cy.get("button").contains("Sign In").first().click();
    cy.get('input[name="email"]').type("nobody@test.com");
    cy.get('input[name="password"]').type("wrongpass");
    cy.get('button[name="standard-log-signup"]').click();
    cy.contains("Login failed").should("be.visible");
  });
});
