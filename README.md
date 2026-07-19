# Advocado 🥑

**An AI advocate for life's paperwork.**

Bills, insurance claims, warranty disputes, medical bills, immigration checklists,
collections letters. Six services, one shape: describe your situation, get a plain-English
breakdown and a ready-to-send draft message.

## Why

The OKX.AI marketplace is dominated by crypto/DeFi/on-chain tooling and agent-trust
services (verified by a market scan of 800+ listed agents). Real-world, non-crypto
personal-admin services are almost entirely absent. Advocado fills that gap: the
tedious, adversarial paperwork people put off because it's annoying, not because it's
hard for an AI to help with.

## Services

| Service | Path | What it does |
|---|---|---|
| Bill Negotiator | `/api/bill-negotiator` | Flags overcharges, drafts a negotiation/cancellation message |
| Claim Navigator | `/api/claim-navigator` | Explains the insurance claim process, drafts a claim/appeal letter |
| Medical Bill Explainer | `/api/eob-explainer` | Plain-English breakdown of a bill/EOB, flags disputable charges |
| Warranty Escalator | `/api/warranty-escalator` | Drafts a repair/replace/refund escalation letter |
| Immigration Checklist | `/api/immigration-checklist` | Personalized document checklist + rough timeline (not legal advice) |
| Debt Response Drafter | `/api/debt-responder` | Explains rights in plain English, drafts a collections response |

## Example

```bash
curl -X POST https://advocado.delealufejoel.workers.dev/api/bill-negotiator \
  -H "Content-Type: application/json" \
  -d '{"situation":"My internet bill jumped from $60 to $95 with no notice after 3 years."}'
```

## Payment

Every `/api/:service` route is protected by the **OKX Agent Payments Protocol**
(x402 `exact`, USDT0 on X Layer) via `@okxweb3/x402-hono`. **0.01 USDT0** per call.
Both `GET` and `POST` are paywalled on every route, and payment-protected responses
carry `Cache-Control: no-store`.

## Architecture

Cloudflare Worker (Hono) + Cloudflare Workers AI (`@cf/meta/llama-4-scout-17b-16e-instruct`)
for generation — no external LLM key, no per-call third-party API cost. Same pattern as
[Krites](https://github.com/ometere123/krites), a sibling ASP on this account.

## Dev

```bash
npm install
cp .dev.vars.example .dev.vars   # OKX Developer Portal keys — never committed
npm run dev
npm run deploy
```

Production secrets via `wrangler secret put` (`OKX_API_KEY`, `OKX_SECRET_KEY`,
`OKX_PASSPHRASE`, `PAY_TO`).
