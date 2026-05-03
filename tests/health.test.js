const request = require("supertest");
const app = require("../app");

describe("Health check endpoints", () => {
  test("GET /health should return 200 and ok status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
  });

  test("GET /api/health should return 200 and ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
  });

  test("GET /api/face/health should return 200 and a status payload", async () => {
    const res = await request(app).get("/api/face/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("faceRecognitionAvailable");
  });
});
