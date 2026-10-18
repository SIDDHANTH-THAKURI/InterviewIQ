/**
 * Which provider keys a request is allowed to spend.
 *
 * There are exactly two sources, and they never mix:
 *   • invite → the owner's keys from the server environment (with limits)
 *   • byok   → keys the visitor pasted in their own browser, used for this
 *              request only — never stored, never logged, and never topped
 *              up with the owner's keys.
 */
export interface ProviderKeys {
  anthropic: string;
  elevenlabs?: string;
  deepgram?: string;
}

/** Bring-your-own-keys is on unless the owner sets ALLOW_BYOK=false. */
export function byokEnabled(): boolean {
  return (process.env.ALLOW_BYOK ?? "true").trim().toLowerCase() !== "false";
}

export function ownerKeys(): ProviderKeys {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY ?? "",
    elevenlabs: process.env.ELEVENLABS_API_KEY || undefined,
    deepgram: process.env.DEEPGRAM_API_KEY || undefined,
  };
}

const clean = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  // Keys are long, single-line tokens. Reject anything else outright.
  return t.length >= 20 && t.length <= 300 && /^[\w\-.:]+$/.test(t) ? t : undefined;
};

/** Validates visitor-supplied keys. Returns null unless an Anthropic key is present. */
export function visitorKeys(input: Partial<Record<keyof ProviderKeys, unknown>> | null | undefined): ProviderKeys | null {
  const anthropic = clean(input?.anthropic);
  if (!anthropic) return null;
  return { anthropic, elevenlabs: clean(input?.elevenlabs), deepgram: clean(input?.deepgram) };
}

export const KEY_HEADERS = {
  anthropic: "x-iq-anthropic-key",
} as const;
