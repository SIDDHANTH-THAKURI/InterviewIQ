"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_CONFIG,
  type InterviewConfig,
  type InterviewDocuments,
  type InterviewFeedback,
  type SessionKeys,
} from "@/types/interview";

interface InterviewState {
  /** Stable id for the current interview attempt. */
  sessionId: string | null;
  documents: InterviewDocuments;
  config: InterviewConfig;
  feedback: InterviewFeedback | null;

  /** Create a fresh session id (called when leaving setup for the room). */
  newSession: () => string;
  setDocuments: (docs: Partial<InterviewDocuments>) => void;
  setConfig: (config: Partial<InterviewConfig>) => void;
  setFeedback: (feedback: InterviewFeedback | null) => void;
  /** Clear everything (e.g. "start over"). */
  reset: () => void;
}

const emptyDocuments: InterviewDocuments = {
  resumeText: "",
  coverLetterText: "",
  jobDescription: "",
};

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set) => ({
      sessionId: null,
      documents: emptyDocuments,
      config: DEFAULT_CONFIG,
      feedback: null,

      newSession: () => {
        const id = makeId();
        set({ sessionId: id, feedback: null });
        return id;
      },
      setDocuments: (docs) =>
        set((s) => ({ documents: { ...s.documents, ...docs } })),
      setConfig: (config) => set((s) => ({ config: { ...s.config, ...config } })),
      setFeedback: (feedback) => set({ feedback }),
      reset: () =>
        set({
          sessionId: null,
          documents: emptyDocuments,
          config: DEFAULT_CONFIG,
          feedback: null,
        }),
    }),
    {
      name: "interviewiq-session",
      // sessionStorage keeps a single tab's flow intact across refresh/navigation
      // without leaking documents into other tabs or future visits.
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.sessionStorage : (undefined as never)
      ),
      partialize: (s) => ({
        sessionId: s.sessionId,
        documents: s.documents,
        config: s.config,
        feedback: s.feedback,
      }),
    }
  )
);
