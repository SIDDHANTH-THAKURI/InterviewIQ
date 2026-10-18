"use client";

import { create } from "zustand";
import type { AccessInfo, CandidateProfile } from "@/types/interview";
import { ApiError, clearPass, fetchAccess, getPass } from "./api";
import { getProfile, saveProfile } from "./db";

type Status = "idle" | "loading" | "ready" | "no-pass" | "denied";

interface AppState {
  status: Status;
  deniedReason?: string;
  access: AccessInfo | null;
  ownerName: string;
  profile: CandidateProfile | null;
  bootstrap: (force?: boolean) => Promise<void>;
  refreshAccess: () => Promise<void>;
  updateProfile: (patch: Partial<CandidateProfile>) => Promise<CandidateProfile>;
  signOut: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  status: "idle",
  access: null,
  ownerName: "",
  profile: null,

  async bootstrap(force = false) {
    if (!force && (get().status === "loading" || get().status === "ready")) return;
    if (!getPass()) {
      set({ status: "no-pass" });
      return;
    }
    set({ status: "loading" });
    try {
      const [{ access, ownerName }, profile] = await Promise.all([fetchAccess(), getProfile()]);
      set({ status: "ready", access, ownerName, profile: profile ?? null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ status: "denied", deniedReason: err.message });
      } else {
        // Server unreachable — still let them see their local history.
        const profile = await getProfile().catch(() => undefined);
        set({ status: "ready", profile: profile ?? null });
      }
    }
  },

  async refreshAccess() {
    try {
      const { access } = await fetchAccess();
      set({ access });
    } catch {
      /* keep last known */
    }
  },

  async updateProfile(patch) {
    const now = Date.now();
    const current = get().profile;
    const next: CandidateProfile = {
      name: "",
      headline: "",
      targetRole: "",
      experienceLevel: "mid",
      resumeText: "",
      nerves: 3,
      goals: [],
      preferredLanguage: "en",
      createdAt: now,
      ...current,
      ...patch,
      updatedAt: now,
    };
    await saveProfile(next);
    set({ profile: next });
    return next;
  },

  signOut() {
    clearPass();
    set({ status: "no-pass", access: null });
  },
}));
