// Cypress global setup — registered commands live here.
import "./commands";

// Silence unhandled app errors from flaky dev-server warm-up.
Cypress.on("uncaught:exception", (err) => {
  // Next.js dev sometimes throws benign errors; don't fail tests on them.
  console.error("uncaught exception:", err.message);
  return false;
});
