import { anthropic, MODELS, parseJson } from "../lib/ai/claude";
import { claudeCost } from "../lib/server/pricing";
import type { VisionAnalysis } from "../types/interview";

const SCHEMA = {
  type: "object",
  properties: {
    presence: { type: "string", enum: ["present", "absent"] },
    eyeContact: { type: "string", enum: ["strong", "moderate", "weak", "none"] },
    posture: { type: "string", enum: ["confident", "neutral", "slouched", "tense"] },
    expression: { type: "string", enum: ["calm", "nervous", "confused", "engaged", "blank"] },
    presentation: { type: "string", enum: ["professional", "casual", "unprofessional"] },
    notes: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["presence", "eyeContact", "posture", "expression", "presentation", "notes"],
  additionalProperties: false,
};

/**
 * One qualitative read of a webcam frame. Returns null on any failure so vision
 * never blocks the conversation.
 */
export async function analyzeFrame(base64Jpeg: string): Promise<{ analysis: VisionAnalysis | null; costUsd: number }> {
  try {
    const msg = await anthropic().messages.create({
      model: MODELS.fast,
      max_tokens: 1500,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system:
        "You read single webcam frames of a candidate in a video interview, like a perceptive interviewer would. Be honest and specific, never judge appearance, ethnicity, or setting beyond professionalism.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } },
            {
              type: "text",
              text: 'Describe the candidate\'s on-camera presence. presence="absent" if no person is clearly visible. notes = one short specific observation (e.g. "glancing off-screen", "leaning in, engaged") or null.',
            },
          ],
        },
      ],
    });
    const costUsd = claudeCost(MODELS.fast, msg.usage);
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = parseJson<VisionAnalysis>(text);
    return { analysis: parsed ? { ...parsed, ts: Date.now() } : null, costUsd };
  } catch (err) {
    console.warn("[vision]", (err as Error).message);
    return { analysis: null, costUsd: 0 };
  }
}
