/**
 * Rough cost estimates so the owner can see what each friend's practice costs.
 * Claude prices are first-party list prices per million tokens; voice prices
 * are typical pay-as-you-go rates — tune them to your plans via env.
 */
import type Anthropic from "@anthropic-ai/sdk";

const CLAUDE_PRICES: Record<string, { in: number; out: number; cacheRead: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
};

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/** USD per 1,000 characters of ElevenLabs Flash speech. */
const TTS_PER_1K_CHARS = num(process.env.PRICE_TTS_PER_1K_CHARS, 0.15);
/** USD per minute of Deepgram Nova-3 streaming audio. */
const STT_PER_MIN = num(process.env.PRICE_STT_PER_MIN, 0.0077);

type UsageLike = Pick<
  Anthropic.Usage,
  "input_tokens" | "output_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens"
>;

export function claudeCost(model: string, usage: Partial<UsageLike> | null | undefined): number {
  if (!usage) return 0;
  const p = CLAUDE_PRICES[model] ?? CLAUDE_PRICES["claude-opus-5-5"];
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) * 1.25;
  const cached = usage.cache_read_input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;
  return (input * p.in + cached * p.cacheRead + out * p.out) / 1_000_000;
}

export function ttsCost(chars: number): number {
  return (chars / 1000) * TTS_PER_1K_CHARS;
}

export function sttCost(minutes: number): number {
  return minutes * STT_PER_MIN;
}
