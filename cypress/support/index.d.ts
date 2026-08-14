/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      /** Sign up a fresh user via the login page UI. */
      signupViaUi(email: string, password?: string): Chainable<void>;
      /** Walk through the full onboarding wizard. */
      completeOnboarding(): Chainable<void>;
    }
  }
}

export {};
