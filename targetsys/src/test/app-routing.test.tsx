import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

describe("App routing (Prompt 1 Foundation)", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it("matches a page for /", () => {
    const matches = router.matchRoutes("/");
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(matches.at(-1)?.routeId).toBe("/");
  });

  it("matches a page for /login", () => {
    const matches = router.matchRoutes("/login");
    expect(matches.at(-1)?.routeId).toBe("/login");
  });

  it("matches a page for /register", () => {
    const matches = router.matchRoutes("/register");
    expect(matches.at(-1)?.routeId).toBe("/register");
  });

  it("matches a page for /app", () => {
    const matches = router.matchRoutes("/app");
    expect(matches.at(-1)?.routeId).toBe("/app/");
  });

  it("matches customer app routes: beneficiaries, devices, security, sessions, sms, transactions, transfer", () => {
    const routes = [
      "/app/beneficiaries",
      "/app/devices",
      "/app/security",
      "/app/sessions",
      "/app/sms",
      "/app/transactions",
      "/app/transfer",
    ];

    for (const route of routes) {
      const matches = router.matchRoutes(route);
      expect(matches.at(-1)?.routeId).toBe(route);
    }
  });

  it("matches a page for /admin", () => {
    const matches = router.matchRoutes("/admin");
    expect(matches.at(-1)?.routeId).toBe("/admin/");
  });

  it("matches a page for /admin/integration", () => {
    const matches = router.matchRoutes("/admin/integration");
    expect(matches.at(-1)?.routeId).toBe("/admin/integration");
  });

  it("matches a page for /admin/responses", () => {
    const matches = router.matchRoutes("/admin/responses");
    expect(matches.at(-1)?.routeId).toBe("/admin/responses");
  });

  it("matches all Prompt 5 and 6 admin routes: customers, transactions, events, sessions, ip-blocklist, audit, selftest, docs", () => {
    const adminRoutes = [
      "/admin/customers",
      "/admin/transactions",
      "/admin/events",
      "/admin/sessions",
      "/admin/ip-blocklist",
      "/admin/audit",
      "/admin/selftest",
      "/admin/docs",
    ];

    for (const route of adminRoutes) {
      const matches = router.matchRoutes(route);
      expect(matches.at(-1)?.routeId).toBe(route);
    }
  });
});
