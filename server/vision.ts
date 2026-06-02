import {
  getAnthropic,
  VISION_MODEL,
  VISION_SYSTEM_PROMPT,
  VISION_USER_PROMPT,
  extractJson,
} from "../lib/claude";
import type {
  EyeContact,
  Expression,
  Gesture,
  Posture,
  Presence,
  Presentation,
  VisionAnalysis,
} from "../types/interview";

const PRESENCE: Presence[] = ["present", "absent"];
const EYE: EyeContact[] = ["strong", "moderate", "weak", "none"];
const POSTURE: Posture[] = ["confident", "neutral", "slouched", "tense"];
const EXPR: Expression[] = ["calm", "nervous", "confused", "engaged", "blank"];
const PRES: Presentation[] = ["professional", "casual", "unprofessional"];
const GESTURE: Gesture[] = [
  "none",
  "waving",
  "hand_raised",
  "touching_face",
  "looking_away",
  "on_phone",
  "shrugging",
];

function coerce<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Sends a single base64 JPEG webcam frame to Claude vision and returns a
 * structured read. Returns null on any failure so vision never blocks the
 * conversation flow.
 */
export async function analyzeFrame(base64Jpeg: string): Promise<VisionAnalysis | null> {
  try {
    const resp = await getAnthropic().messages.create({
      model: VISION_MODEL,
      max_tokens: 256,
      system: VISION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg },
            },
            { type: "text", text: VISION_USER_PROMPT },
          ],
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const parsed = extractJson<Partial<VisionAnalysis>>(raw);
    if (!parsed) return null;

    return {
      presence: coerce(parsed.presence, PRESENCE, "present"),
      eyeContact: coerce(parsed.eyeContact, EYE, "moderate"),
      posture: coerce(parsed.posture, POSTURE, "neutral"),
      expression: coerce(parsed.expression, EXPR, "calm"),
      presentation: coerce(parsed.presentation, PRES, "professional"),
      gesture: coerce(parsed.gesture, GESTURE, "none"),
      notes:
        typeof parsed.notes === "string" && parsed.notes.trim()
          ? parsed.notes.trim()
          : null,
      ts: Date.now(),
    };
  } catch (err) {
    console.warn("[vision] analyze failed:", (err as Error).message);
    return null;
  }
}
