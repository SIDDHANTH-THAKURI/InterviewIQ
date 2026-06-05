import type { InterviewFeedback } from "@/types/interview";

/**
 * A realistic example report. Shown on the feedback page when no real session
 * feedback is available (e.g. opening /feedback directly), so the page is always
 * presentable. The UI labels it as a sample in that case.
 */
export const SAMPLE_FEEDBACK: InterviewFeedback = {
  overallScore: 78,
  grade: "B+",
  dimensions: {
    communication: 82,
    technicalDepth: 71,
    confidence: 75,
    relevance: 85,
    structure: 70,
  },
  answerAnnotations: [
    {
      question: "Walk me through a project you’re most proud of.",
      answer:
        "I led the migration of our billing system to a new provider over a quarter, coordinating three teams.",
      quality: "strong",
      annotation:
        "Strong ownership signal. You named the scope and the stakes — next time, lead with the measurable outcome too.",
    },
    {
      question: "How did you handle the rollback risk during that migration?",
      answer:
        "We had a plan, and we tested things before going live so it mostly went fine.",
      quality: "weak",
      annotation:
        "Vague. ‘Mostly fine’ undersells you. Quantify: what was your rollback window, and what specifically did you test?",
    },
    {
      question: "Tell me about a time you disagreed with a manager.",
      answer:
        "I pushed back on a deadline I thought was unrealistic and proposed a phased delivery instead.",
      quality: "strong",
      annotation:
        "Good — you showed spine plus a constructive alternative. Add how the manager responded to close the loop.",
    },
    {
      question: "What would you improve about your last team’s process?",
      answer: "Um… I think maybe code reviews could be faster.",
      quality: "missed",
      annotation:
        "Missed opportunity. This is an easy chance to show systems thinking; you stayed surface-level and hesitant.",
    },
  ],
  visionReport: {
    eyeContactScore: 68,
    bodyLanguageSummary:
      "Posture was steady and engaged for most of the session. You leaned in when answering behavioral questions, but eye contact dipped noticeably on the two technical questions — a tell that you were searching for the answer.",
    presentationNotes:
      "Clean, professional framing and lighting. Watch a tendency to look down and to the left when buying time.",
    liveMetrics: {
      frames: 2840,
      presentPct: 98,
      eyeContactPct: 68,
      blinksPerMin: 24,
      smilePct: 22,
      headSteadiness: 81,
      engagement: 74,
    },
  },
  topThreeImprovements: [
    "Quantify everything. Replace ‘mostly fine’ and ‘faster’ with numbers, timelines and outcomes.",
    "Hold eye contact through technical answers — pausing to think is fine, looking away reads as uncertainty.",
    "Structure answers with a one-line headline first, then the detail. Several answers buried the point.",
  ],
  strengths: [
    "Clear ownership and initiative in behavioral stories.",
    "Comfortable, warm communication style that builds rapport quickly.",
  ],
  overallSummary:
    "A solid, hireable interview with real strengths in ownership and rapport. The gap is precision: your best stories were undercut by vague follow-ups and a dip in confidence on technical ground. Tighten your specifics and steady your delivery under pressure and this moves from a B+ to an A-.",
};
