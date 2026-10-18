"use client";

import { create } from "zustand";
import type { AccessInfo, CandidateProfile } from "@/types/interview";
import { ApiError, accessMode, clearOwnKeys, clearPass, fetchAccess, getOwnKeys, type OwnKeys } from "./api";
import { getProfile, saveProfile } from "./db";

type Status = "idle" | "loading" | "ready" | "no-pass" | "denied";

interface AppState {
  status: Status;
  deniedReason?: string;
  /** invite = owner's keys with limits · byok = the visitor's own keys */
  mode: "invite" | "byok" | null;
  access: AccessInfo | null;
  ownKeys: OwnKeys | null;
  ownerName: string;
  profile: CandidateProfile | null;
  bootstrap: (force?: boolean) => Promise<void>;
  refreshAccess: () => Promise<void>;
  updateProfile: (patch: Partial<CandidateProfile>) => Promise<CandidateProfile>;
  signOut: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  status: "idle",
  mode: null,
  access: null,
  ownKeys: null,
  ownerName: "",
  profile: null,

  async bootstrap(force = false) {
    if (!force && (get().status === "loading" || get().status === "ready")) return;
    const mode = accessMode();
    if (!mode) {
      set({ status: "no-pass", mode: null });
      return;
    }
    set({ status: "loading", mode });
    if (mode === "byok") {
      const profile = await getProfile().catch(() => undefined);
      set({ status: "ready", access: null, ownKeys: getOwnKeys(), profile: profile ?? null });
      return;
    }
    try {
      const [{ access, ownerName }, profile] = await Promise.all([fetchAccess(), getProfile()]);
      set({ status: "ready", access, ownerName, ownKeys: null, profile: profile ?? null });
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
    if (get().mode !== "invite") return;
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
    clearOwnKeys();
    set({ status: "no-pass", mode: null, access: null, ownKeys: null });
  },
}));
