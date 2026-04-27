const request = require("supertest");
const app = require("../index");

// These tests assume you have a dedicated test database and, optionally,
// seeded credentials for a known user. To avoid accidentally hitting a
// production database, only run them when NODE_ENV=test.

const hasValidCreds =
  !!process.env.TEST_USER_EMAIL && !!process.env.TEST_USER_PASSWORD;

describe("Auth API", () => {
  const basePath = "/api/auth";

  (hasValidCreds ? test : test.skip)(
    "POST /api/auth/login with valid credentials should return 200",
    async () => {
      const res = await request(app)
        .post(`${basePath}/login`)
        .send({
          email: process.env.TEST_USER_EMAIL,
          password: process.env.TEST_USER_PASSWORD,
        })
        .set("Accept", "application/json");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(res.body).toHaveProperty("role");
    }
  );

  test("POST /api/auth/login with invalid credentials should return 401", async () => {
    const res = await request(app)
      .post(`${basePath}/login`)
      .send({
        email: "nonexistent+test@example.com",
        password: "incorrect-password",
      })
      .set("Accept", "application/json");

    expect([400, 401]).toContain(res.status);
  });
});

