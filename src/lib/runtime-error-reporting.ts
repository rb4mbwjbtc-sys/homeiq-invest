type ErrorContext = Record<string, unknown>;

declare global {
  interface Window {
    __HOMEIQ_ERROR_REPORTER__?: (error: unknown, context: ErrorContext) => void;
  }
}

/**
 * Provider-neutral runtime error hook.
 *
 * By default errors are logged to the browser console. A hosting environment
 * can optionally install window.__HOMEIQ_ERROR_REPORTER__ to forward errors to
 * Sentry, Bugsnag, Datadog or another monitoring service without coupling the
 * application to a specific platform.
 */
export function reportRuntimeError(error: unknown, context: ErrorContext = {}) {
  if (typeof window === "undefined") return;

  const enrichedContext = {
    source: "react_error_boundary",
    route: window.location.pathname,
    ...context,
  };

  console.error("[HomeIQ runtime error]", error, enrichedContext);
  window.__HOMEIQ_ERROR_REPORTER__?.(error, enrichedContext);
}
