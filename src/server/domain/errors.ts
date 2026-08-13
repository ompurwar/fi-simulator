/** Domain error types, ported from src/utils/errors.js (findependence-core). */

export class FiPlanError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "FiPlanError";
    this.code = code;
  }
}

export class UniqueConstraintError extends FiPlanError {
  constructor(message = "duplicate entry") {
    super(message);
    this.name = "UniqueConstraintError";
  }
}

export class InvalidPropertyError extends FiPlanError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPropertyError";
  }
}

export class RequiredParameterError extends FiPlanError {
  constructor(message: string) {
    super(message);
    this.name = "RequiredParameterError";
  }
}

export class DbInsertFailedError extends FiPlanError {
  constructor(message = "db insert failed") {
    super(message);
    this.name = "DbInsertFailedError";
  }
}

export class DbUpdateFailedError extends FiPlanError {
  constructor(message = "db update failed") {
    super(message);
    this.name = "DbUpdateFailedError";
  }
}

export class UserNotFoundByEmailError extends FiPlanError {
  constructor(message = "user not found by email") {
    super(message);
    this.name = "UserNotFoundByEmailError";
  }
}

export class UnAuthorizedAccessToPlan extends FiPlanError {
  constructor(message = "unauthorized access to plan") {
    super(message, 800);
    this.name = "UnAuthorizedAccessToPlan";
  }
}

export class InvalidAuthTokenError extends FiPlanError {
  constructor(message = "invalid auth token") {
    super(message, 401);
    this.name = "InvalidAuthTokenError";
  }
}

export class InvalidOperationError extends FiPlanError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOperationError";
  }
}

export class StandardHttpError extends FiPlanError {
  constructor(message: string, code?: number) {
    super(message, code);
    this.name = "StandardHttpError";
  }
}

export class FiPlanServerHttpError extends Error {
  code?: number;
  constructor(message: string, error?: { code?: number; msg?: string }) {
    super(error?.msg || message);
    this.name = "FiPlanServerHttpError";
    this.code = error?.code;
  }
}
