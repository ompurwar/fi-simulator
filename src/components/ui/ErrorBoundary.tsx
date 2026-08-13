"use client";

import { Component, type ReactNode } from "react";

interface ErrorBoundaryState {
  err: Error | null;
}

/** Port of ErrorBoundary.vue — catches render errors and shows fallback UI. */
export class ErrorBoundary extends Component<
  { children: ReactNode; stopPropagation?: boolean },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error) {
    console.error("[ErrorBoundary]", err);
  }

  render() {
    if (this.state.err) {
      const code = (this.state.err as any)?.code;
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-dark-50 p-6 text-center">
          <div className="text-5xl">😵</div>
          <h1 className="mt-4 text-xl font-bold text-dark-800">Something went wrong</h1>
          <p className="mt-2 text-sm text-dark-500">
            {code ? `Error ${code}: ` : ""}
            {this.state.err.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => {
              if (code === 401) window.location.href = "/login";
              else window.location.reload();
            }}
            className="mt-6 rounded-lg bg-primary-500 px-5 py-2 text-white hover:bg-primary-600"
          >
            {code === 401 ? "Login" : "Refresh App"}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
