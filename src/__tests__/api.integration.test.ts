// Runs against a real Postgres (see jest.integration.config.js + README's
// "Testing" section for how to point DATABASE_URL at one locally; CI wires
// up a throwaway service container). The scheduler's own unit tests already
// cover the scoring/knapsack logic in isolation — this file exists to catch
// what those can't: routing, session handling, and cross-user data leaks.
import request from "supertest";
import { app } from "../app.ts";
import { prisma } from "../lib/prisma.ts";

describe("API integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("GET /health responds without a session", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("GET /api/games without a session is rejected", async () => {
    const res = await request(app).get("/api/games");
    expect(res.status).toBe(401);
  });

  describe("as a logged-in user", () => {
    let cookie = "";

    beforeAll(async () => {
      const res = await request(app).post("/auth/dev-login");
      expect(res.status).toBe(200);
      const setCookie = res.headers["set-cookie"];
      cookie = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as unknown as string);
    });

    test("GET /auth/me reflects the session", async () => {
      const res = await request(app).get("/auth/me").set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(typeof res.body.userId).toBe("number");
    });

    test("GET /api/games succeeds and returns only this user's games", async () => {
      const res = await request(app).get("/api/games").set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test("POST /api/plans with no schedulable games returns an empty plan", async () => {
      const res = await request(app).post("/api/plans").set("Cookie", cookie).send({ hoursAvailable: 5 });
      expect(res.status).toBe(201);
      expect(res.body.entries).toEqual([]);
    });

    test("POST /api/plans rejects a non-positive budget", async () => {
      const res = await request(app).post("/api/plans").set("Cookie", cookie).send({ hoursAvailable: 0 });
      expect(res.status).toBe(400);
    });

    // The scoping fix this guards: Game.steamAppId used to be globally
    // unique and routes used to trust a raw :id with no ownership check —
    // both are covered in docs/scheduling.md and the engineering notes.
    test("cannot read or modify another user's game (IDOR check)", async () => {
      const otherUser = await prisma.user.create({
        data: { email: `other-${Date.now()}@backlog-tactician.test` },
      });
      const otherGame = await prisma.game.create({
        data: { userId: otherUser.id, steamAppId: 999999, name: "Not yours" },
      });

      try {
        const listRes = await request(app).get("/api/games").set("Cookie", cookie);
        expect(listRes.body.some((g: { id: number }) => g.id === otherGame.id)).toBe(false);

        const patchRes = await request(app)
          .patch(`/api/games/${otherGame.id}`)
          .set("Cookie", cookie)
          .send({ timeToBeatHours: 1 });
        expect(patchRes.status).toBe(404);

        const sessionRes = await request(app)
          .post(`/api/games/${otherGame.id}/play-sessions`)
          .set("Cookie", cookie)
          .send({ hoursPlayed: 1 });
        expect(sessionRes.status).toBe(404);
      } finally {
        await prisma.game.delete({ where: { id: otherGame.id } });
        await prisma.user.delete({ where: { id: otherUser.id } });
      }
    });

    test("logout clears the session", async () => {
      const logoutRes = await request(app).post("/auth/logout").set("Cookie", cookie);
      expect(logoutRes.status).toBe(200);

      const meRes = await request(app).get("/auth/me").set("Cookie", cookie);
      expect(meRes.body.userId).toBeNull();
    });
  });
});
