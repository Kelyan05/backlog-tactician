import { prisma } from "./prisma.ts";

// Dev-only convenience: lets `/auth/dev-login` establish a real session
// without going through Steam's actual login page (which needs a real
// browser + real Steam credentials neither CI nor an agent has). Seeds the
// dev user's steamId from .env so STEAM_API_KEY/STEAM_ID testing still
// works without a real OpenID round trip. Never used by any real data
// route — those all require a genuine session (see requireAuth).
const DEV_OWNER_EMAIL = "dev@backlog-tactician.local";

export async function getOrCreateDevOwner() {
  const existing = await prisma.user.findUnique({ where: { email: DEV_OWNER_EMAIL } });
  if (existing) return existing;

  return prisma.user.create({
    data: { email: DEV_OWNER_EMAIL, steamId: process.env.STEAM_ID ?? null },
  });
}
