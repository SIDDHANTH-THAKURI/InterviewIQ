/**
 * Measured delivery stats — computed, not guessed, from the transcript.
 */
import type { DeliveryStats, TranscriptTurn } from "../../types/interview";

const FILLERS = [
  "um",
  "uh",
  "erm",
  "hmm",
  "like",
  "you know",
  "basically",
  "actually",
  "literally",
  "sort of",
  "kind of",
  "i mean",
  "right",
  "so yeah",
];

/** "like" and "right" are only fillers when they float free between commas/pauses. */
const LOOSE = new Set(["like", "right"]);

export function computeDelivery(transcript: TranscriptTurn[], hintsUsed: number): DeliveryStats {
  const answers = transcript.filter((t) => t.role === "candidate" && t.text.trim());
  const words = answers.reduce((n, t) => n + countWords(t.text), 0);
  const speakingSec = answers.reduce((n, t) => n + (t.speakingSec ?? 0), 0);

  const counts = new Map<string, number>();
  for (const a of answers) {
    const text = ` ${a.text.toLowerCase().replace(/[^\p{L}\p{N}',\s]/gu, " ")} `;
    for (const f of FILLERS) {
      const pattern = LOOSE.has(f) ? `(?:^|,)\\s*${f}\\s*(?:,|$)` : `\\b${f.replace(" ", "\\s+")}\\b`;
      const hits = text.match(new RegExp(pattern, "g"))?.length ?? 0;
      if (hits) counts.set(f, (counts.get(f) ?? 0) + hits);
    }
  }
  const fillerCount = [...counts.values()].reduce((a, b) => a + b, 0);

  return {
    answers: answers.length,
    totalWords: words,
    wpm: speakingSec > 20 ? Math.round(words / (speakingSec / 60)) : null,
    avgAnswerWords: answers.length ? Math.round(words / answers.length) : 0,
    fillerCount,
    fillerPer100: words ? Math.round((fillerCount / words) * 1000) / 10 : 0,
    topFillers: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([word, count]) => ({ word, count })),
    hintsUsed,
  };
}

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}
