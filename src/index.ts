// Advocado — an AI advocate for life's paperwork. Six services, one Worker.
//
// Routes:
//   GET  /                    — landing + live demo page (free)
//   GET  /about                — service metadata JSON (free)
//   POST /demo/:service        — rate-limited free run, feeds the demo page
//   GET|POST /api/:service     — paid ($0.01, x402 exact / X Layer) per service
//
// Payment: OKX Agent Payments Protocol via @okxweb3/x402-hono. Both GET and POST are
// paywalled on every route (a listing validator may probe with either method — a lesson
// learned the hard way on a sibling project), and payment-protected responses always
// carry Cache-Control: no-store.

import { Hono } from "hono";
import { OKXFacilitatorClient } from "@okxweb3/x402-core/facilitator";
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  paymentMiddlewareFromHTTPServer,
} from "@okxweb3/x402-hono";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { runAdvocate, SERVICE_LIST, type ServiceId, type AdvocateInput } from "./advocate";
import { PAGE_HTML } from "./page";

// OKX.AI's own task system resolves the payment token from the accepts entry, and its
// short internal token list doesn't recognize the SDK's default X Layer USDT0 asset
// without an explicit `decimals` field (confirmed via `onchainos agent x402-check`,
// which throws a tokenResolveError on the SDK's default challenge output). Inject
// decimals + symbol into every challenge so OKX's platform can resolve the amount.
class XLayerExactScheme extends ExactEvmScheme {
  override async enhancePaymentRequirements(
    pr: any,
    supportedKind: any,
    extensionKeys: string[]
  ): Promise<any> {
    const base = await super.enhancePaymentRequirements(pr, supportedKind, extensionKeys);
    return {
      ...base,
      decimals: 6,
      extra: { ...(base.extra ?? {}), decimals: 6, symbol: "USDT" },
    };
  }
}

interface Env {
  OKX_API_KEY: string;
  OKX_SECRET_KEY: string;
  OKX_PASSPHRASE: string;
  PAY_TO: string;
  AI: Ai;
}

const PRICE = "$0.01";
const SERVICE_IDS = new Set(SERVICE_LIST.map((s) => s.id));

function normalizeInput(service: ServiceId, raw: Record<string, unknown>): AdvocateInput {
  const situation =
    typeof raw.situation === "string"
      ? raw.situation
      : service === "debt-responder" && typeof raw.collectionsDetails === "string"
        ? raw.collectionsDetails
        : "";
  const contextParts = [raw.context, service === "debt-responder" ? raw.recognizeDebt : undefined]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return { situation, context: contextParts.join("\n") || undefined };
}

const demoHits = new Map<string, { count: number; resetAt: number }>();
const DEMO_LIMIT = 20;

function demoAllowed(ip: string): boolean {
  const now = Date.now();
  const cur = demoHits.get(ip);
  if (!cur || now > cur.resetAt) {
    demoHits.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  cur.count += 1;
  return cur.count <= DEMO_LIMIT;
}

let httpServerPromise: Promise<x402HTTPResourceServer> | null = null;

function buildApp(env: Env) {
  const facilitator = new OKXFacilitatorClient({
    apiKey: env.OKX_API_KEY,
    secretKey: env.OKX_SECRET_KEY,
    passphrase: env.OKX_PASSPHRASE,
    syncSettle: true,
  });

  const resourceServer = new x402ResourceServer(facilitator).register(
    "eip155:196",
    new XLayerExactScheme()
  );

  const paidRoute = {
    scheme: "exact" as const,
    network: "eip155:196" as const,
    payTo: env.PAY_TO,
    price: PRICE,
    maxTimeoutSeconds: 300,
  };

  const routes: Record<string, { accepts: typeof paidRoute; description: string; mimeType: string }> = {};
  for (const svc of SERVICE_LIST) {
    const routeCfg = {
      accepts: paidRoute,
      description: `${svc.name} — life-admin advocacy service.`,
      mimeType: "application/json",
    };
    routes[`GET /api/${svc.id}`] = routeCfg;
    routes[`POST /api/${svc.id}`] = routeCfg;
  }
  const httpServer = new x402HTTPResourceServer(resourceServer, routes);

  const app = new Hono<{ Bindings: Env }>();

  // ---- free routes ----
  app.get("/", (c) => c.html(PAGE_HTML));

  app.get("/about", (c) =>
    c.json({
      service: "Advocado",
      tagline: "An AI advocate for life's paperwork.",
      services: SERVICE_LIST.map((s) => ({ id: s.id, name: s.name, price: s.price, path: `/api/${s.id}` })),
      demo: { method: "POST", path: "/demo/:service", price: "free (rate-limited)" },
    })
  );

  app.post("/demo/:service", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    if (!demoAllowed(ip)) {
      return c.json({ error: "Demo limit reached for this hour. Use the paid /api route." }, 429);
    }
    const service = c.req.param("service") as ServiceId;
    if (!SERVICE_IDS.has(service)) {
      return c.json({ error: `Unknown service. Valid: ${[...SERVICE_IDS].join(", ")}` }, 400);
    }
    const input = normalizeInput(service, await c.req.json().catch(() => ({})));
    if (!input.situation || input.situation.trim().length < 10) {
      return c.json({ error: "Provide `situation`: describe what's going on (min 10 chars)." }, 400);
    }
    try {
      return c.json(await runAdvocate(c.env.AI, service, input));
    } catch {
      return c.json({ error: "Generation failed; try rephrasing your situation." }, 502);
    }
  });

  // ---- paid routes ----
  app.use("*", async (c, next) => {
    if (!httpServerPromise) {
      httpServerPromise = resourceServer.initialize().then(() => httpServer);
      httpServerPromise.catch(() => { httpServerPromise = null; });
    }
    const server = await httpServerPromise;
    const result = await paymentMiddlewareFromHTTPServer(server)(c, next);
    if (result instanceof Response) {
      const headers = new Headers(result.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
    }
    c.header("Cache-Control", "no-store");
    return result;
  });

  const apiHandler = async (c: any) => {
    const service = c.req.param("service") as ServiceId;
    if (!SERVICE_IDS.has(service)) {
      return c.json({ error: `Unknown service. Valid: ${[...SERVICE_IDS].join(", ")}` }, 400);
    }
    let input: AdvocateInput;
    if (c.req.method === "GET") {
      const q = c.req.query();
      input = { situation: q.situation ?? "", context: q.context };
    } else {
      input = normalizeInput(service, await c.req.json().catch(() => ({})));
    }
    if (!input.situation || input.situation.trim().length < 10) {
      return c.json({ error: "Provide `situation`: describe what's going on (min 10 chars)." }, 400);
    }
    try {
      return c.json(await runAdvocate(c.env.AI, service, input));
    } catch {
      return c.json({ error: "Generation failed; try rephrasing your situation." }, 502);
    }
  };
  app.get("/api/:service", apiHandler);
  app.post("/api/:service", apiHandler);

  return app;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return buildApp(env).fetch(request, env, ctx);
  },
};
