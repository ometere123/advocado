// Advocado — six life-admin advocacy services, one shared runner.
//
// Every service takes the user's situation in plain text and returns the same shape:
// a summary, key findings, a ready-to-send draft message, and next steps. Each service
// is really just a different system prompt + a not-legal-advice disclaimer where it
// matters (medical, immigration). Runs on Cloudflare Workers AI — no external LLM key.

export type ServiceId =
  | "bill-negotiator"
  | "claim-navigator"
  | "eob-explainer"
  | "warranty-escalator"
  | "immigration-checklist"
  | "debt-responder";

export interface AdvocateInput {
  situation: string; // the user's free-text description (bill text, claim details, etc.)
  context?: string; // optional extra context (provider name, amount, country, etc.)
}

export interface AdvocateOutput {
  summary: string;
  keyPoints: string[];
  draftMessage: string;
  nextSteps: string[];
  disclaimer: string;
}

interface ServiceConfig {
  systemPrompt: string;
  disclaimer: string;
}

const NOT_ADVICE =
  "Advocado organizes information and drafts messages - it is not a lawyer, accountant, " +
  "doctor, or immigration attorney. Verify anything consequential with a licensed professional.";

const SERVICES: Record<ServiceId, ServiceConfig> = {
  "bill-negotiator": {
    systemPrompt:
      "You are a bill and subscription negotiation advocate. Given a description of a " +
      "bill or subscription (provider, amount, history), identify likely overcharges, " +
      "price-increase patterns, or unused services, then draft a polite but firm " +
      "negotiation or cancellation message the user can send as-is.",
    disclaimer: NOT_ADVICE,
  },
  "claim-navigator": {
    systemPrompt:
      "You are an insurance claim navigator. Given a description of an insurance " +
      "situation (type of insurance, what happened, what's being denied or delayed), " +
      "explain the likely claim process step by step and draft a claim or appeal letter " +
      "the user can send as-is.",
    disclaimer: NOT_ADVICE,
  },
  "eob-explainer": {
    systemPrompt:
      "You are a medical bill and insurance Explanation of Benefits (EOB) explainer. " +
      "Given a description or transcription of a medical bill or EOB, explain in plain " +
      "English what is being charged, what insurance covered, and which line items look " +
      "worth disputing (e.g. balance billing, duplicate charges, out-of-network surprises). " +
      "Draft a dispute message where relevant.",
    disclaimer:
      NOT_ADVICE + " This is not medical or billing-compliance advice - confirm disputed " +
      "charges with your provider's billing office or insurer.",
  },
  "warranty-escalator": {
    systemPrompt:
      "You are a warranty and product-return escalation advocate. Given a description of " +
      "a defective product and the runaround the user has faced, draft an escalation " +
      "letter (firm, factual, cites consumer rights generically without inventing specific " +
      "statutes) requesting repair, replacement, or refund.",
    disclaimer: NOT_ADVICE,
  },
  "immigration-checklist": {
    systemPrompt:
      "You are an immigration and visa paperwork organizer. Given a description of a " +
      "visa or immigration situation (visa type if known, country, purpose, timeline), " +
      "produce a general personalized document checklist and a rough process timeline. " +
      "Do NOT give legal advice, predict outcomes, or claim to know country-specific legal " +
      "requirements precisely - always frame as a starting checklist to verify with an " +
      "immigration attorney or the relevant consulate.",
    disclaimer:
      "Advocado is not an immigration attorney and this is not legal advice. Immigration " +
      "rules vary by country and change frequently - verify every item with an accredited " +
      "immigration attorney or the relevant consulate before relying on it.",
  },
  "debt-responder": {
    systemPrompt:
      "You are a debt collections response advocate. Given a description or transcription " +
      "of a collections letter or call, explain the user's general rights in plain English " +
      "(e.g. right to request debt validation, dispute inaccuracies) without citing specific " +
      "statutes by number, and draft a response letter requesting validation or disputing " +
      "the debt as appropriate.",
    disclaimer: NOT_ADVICE,
  },
};

export async function runAdvocate(
  ai: Ai,
  service: ServiceId,
  input: AdvocateInput
): Promise<AdvocateOutput> {
  const cfg = SERVICES[service];
  const user =
    `Situation: ${input.situation}` + (input.context ? `\nAdditional context: ${input.context}` : "");

  const fullSystemPrompt =
    cfg.systemPrompt +
    " Respond with ONLY a JSON object, no markdown, with exactly these keys: " +
    "summary (string), keyPoints (string[]), draftMessage (string), nextSteps (string[]).";

  // Bound the model call: a slow or hanging Workers AI response must never hang
  // Advocado itself — OKX's listing validator (and any real caller) expects a prompt
  // reply. Observed directly during testing: this exact call sometimes needed several
  // seconds longer than usual, which is enough to time out an automated one-shot test.
  // The Ai binding has no confirmed AbortSignal support, so race it against a timer
  // instead of relying on cancellation — this guarantees OUR response lands on time
  // even if the underlying call keeps running.
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Workers AI call timed out after 15s")), 15000)
  );
  const res = (await Promise.race([
    ai.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: user },
      ],
      max_tokens: 1400,
    }),
    timeoutPromise,
  ])) as { response?: unknown };

  let parsed: Partial<Omit<AdvocateOutput, "disclaimer">>;
  if (res.response && typeof res.response === "object") {
    parsed = res.response as Partial<Omit<AdvocateOutput, "disclaimer">>;
  } else {
    const raw = String(res.response ?? "");
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("advocate model returned no JSON");
    parsed = JSON.parse(match[0]) as Partial<Omit<AdvocateOutput, "disclaimer">>;
  }

  return {
    summary: parsed.summary ?? "",
    keyPoints: parsed.keyPoints ?? [],
    draftMessage: parsed.draftMessage ?? "",
    nextSteps: parsed.nextSteps ?? [],
    disclaimer: cfg.disclaimer,
  };
}

export const SERVICE_LIST: { id: ServiceId; name: string; price: string }[] = [
  { id: "bill-negotiator", name: "Bill Negotiator", price: "$0.01" },
  { id: "claim-navigator", name: "Claim Navigator", price: "$0.01" },
  { id: "eob-explainer", name: "Medical Bill Explainer", price: "$0.01" },
  { id: "warranty-escalator", name: "Warranty Escalator", price: "$0.01" },
  { id: "immigration-checklist", name: "Immigration Checklist", price: "$0.01" },
  { id: "debt-responder", name: "Debt Response Drafter", price: "$0.01" },
];
