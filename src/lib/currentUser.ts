import { prisma } from "./prisma.ts";

// Single-user app for now — everything is imported/scheduled for this one owner.
export const OWNER_EMAIL = "dev@backlog-tactician.local";

export async function getOrCreateOwner() {
  return prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { email: OWNER_EMAIL },
  });
}
