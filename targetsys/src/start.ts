// attachTestbedHeaders replaces the generated attachSupabaseAuth: it attaches the bearer token plus device/session headers.
import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { isRedirect } from "@tanstack/react-router";
import { renderErrorPage } from "./lib/error-page";
import { attachTestbedHeaders } from "./lib/client-headers";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (
      isRedirect(error) ||
      error instanceof Response ||
      (error != null && typeof error === "object" && ("statusCode" in error || "status" in error || "isRedirect" in error))
    ) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachTestbedHeaders],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
