import { currentUsage, type Member } from "./access";

/** Admin-facing view of a member: limits, this month, lifetime and the share link token. */
export function serializeMember(member: Member, token: string) {
  const months = Object.entries(member.usage).sort(([a], [b]) => a.localeCompare(b));
  const lifetime = months.reduce(
    (t, [, u]) => ({
      minutes: t.minutes + u.minutes,
      sessions: t.sessions + u.sessions,
      preps: t.preps + u.preps,
      costUsd: t.costUsd + u.costUsd,
    }),
    { minutes: 0, sessions: 0, preps: 0, costUsd: 0 }
  );
  return {
    id: member.id,
    name: member.name,
    note: member.note ?? "",
    role: member.role,
    createdAt: member.createdAt,
    lastSeenAt: member.lastSeenAt,
    revoked: member.revoked,
    expiresAt: member.expiresAt,
    limits: member.limits,
    month: currentUsage(member),
    lifetime,
    history: months.map(([month, u]) => ({ month, ...u })),
    token,
  };
}

export type MemberView = ReturnType<typeof serializeMember>;
