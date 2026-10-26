import "@testing-library/jest-dom/vitest";

process.env["SUPABASE_URL"] = process.env["SUPABASE_URL"] || "https://dummy.supabase.co";
process.env["SUPABASE_SERVICE_ROLE_KEY"] =
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
  "dummy-service-role-key-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.test";
process.env["APP_ENCRYPTION_KEY"] =
  process.env["APP_ENCRYPTION_KEY"] || "shieldbank-test-key-32bytes-secret";

// Prevent real DNS lookups to dummy.supabase.co from timing out in tests
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("dummy.supabase.co")) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: () => {},
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
