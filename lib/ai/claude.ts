/**
 * Anthropic client, model choices and small request helpers.
 *
 * Shared by the Next.js route handlers and the realtime server, so it only uses
 * relative imports and never touches browser globals.
 */
import Anthropic from "@anthropic-ai/sdk";
import { claudeCost } from "../server/pricing";

/** Model per job. Override any of them via env without touching code. */
export const MODELS = {
  /** The live interviewer: fast, natural, conversational. */
  interviewer: process.env.MODEL_INTERVIEWER || "claude-sonnet-5-5",
  /** Final scored report + prep packs: the most careful reasoning. */
  coach: process.env.MODEL_COACH || "claude-opus-5-5",
  /** Webcam reads, live hints, resume extraction: cheap and quick. */
  fast: process.env.MODEL_FAST || "claude-haiku-5-5",
  /** Company research with web search. */
  research: process.env.MODEL_RESEARCH || "claude-sonnet-5-5",
} as const;

/** Server-side refusal fallback: a declined request is re-run on Anthropic's recommended model. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic({ maxRetries: 2 });
  return client;
}

export interface StructuredResult<T> {
  data: T | null;
  costUsd: number;
}

/**
 * One structured-output request. Streams (long outputs never hit HTTP
 * timeouts) and returns the parsed JSON plus its estimated cost.
 */
export async function structured<T>({
  model,
  system,
  user,
  schema,
  effort = "high",
  maxTokens = 32000,
}: {
  model: string;
  system: string;
  user: Anthropic.Beta.BetaMessageParam["content"];
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high" | "xhigh";
  maxTokens?: number;
}): Promise<StructuredResult<T>> {
  const stream = anthropic().beta.messages.stream({
    model,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: { type: "json_schema", schema } },
  });
  const msg = await stream.finalMessage();
  const costUsd = claudeCost(msg.model || model, msg.usage);
  if (msg.stop_reason === "refusal") return { data: null, costUsd };
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { data: parseJson<T>(text), costUsd };
}

/** Tolerant JSON parse (handles stray fences or prose around an object). */
export function parseJson<T>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/* ───────────────────────── JSON-schema shorthands ───────────────────────── */

export const S = {
  str: { type: "string" } as const,
  int: { type: "integer" } as const,
  bool: { type: "boolean" } as const,
  strArr: { type: "array", items: { type: "string" } } as const,
  enum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
  arr: (items: Record<string, unknown>) => ({ type: "array", items }),
  nullable: (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] }),
  obj: (properties: Record<string, unknown>) => ({
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }),
};
