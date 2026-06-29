import type { NextRequest } from "next/server";

/**
 * Server-side proxy for the one-time welcome intro speech.
 *
 * The browser sends the candidate's BYOK ElevenLabs key (already in their
 * localStorage) plus a line of text; we call ElevenLabs server-side and stream
 * the mp3 back. Going through our own origin avoids any browser CORS issues and
 * keeps the request shape identical in dev and on Vercel.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MALE_VOICE = process.env.ELEVENLABS_VOICE_ID_MALE || "pNInz6obpgDQGcFmaJgB"; // Adam

export async function POST(req: NextRequest) {
  let text = "";
  let apiKey = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text : "";
    apiKey = typeof body?.apiKey === "string" ? body.apiKey : "";
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const key = (apiKey || process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) return new Response("Missing ElevenLabs API key", { status: 400 });
  if (!text.trim()) return new Response("Missing text", { status: 400 });

  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${MALE_VOICE}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.15,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return new Response(`TTS failed (${r.status}): ${detail.slice(0, 200)}`, {
        status: 502,
      });
    }

    const audio = await r.arrayBuffer();
    return new Response(audio, {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (err) {
    return new Response(`TTS error: ${(err as Error).message}`, { status: 502 });
  }
}
