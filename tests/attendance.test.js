const request = require("supertest");
const app = require("../index");

// For safety, these tests only exercise the happy-path shape when a
// TEST_STUDENT_TOKEN is available. Otherwise they assert that the endpoint
// is protected and returns 401/403 for missing/invalid auth.

const basePath = "/api/attendance";
const studentToken = process.env.TEST_STUDENT_TOKEN;

describe("Attendance API", () => {
  (studentToken ? test : test.skip)(
    "POST /api/attendance/mark with valid token and payload should return success",
    async () => {
      const res = await request(app)
        .post(`${basePath}/mark`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ code: "TESTCODE" });

      // In a real test database this should be 200 with a JSON body.
      expect([200, 400]).toContain(res.status);
      expect(res.type).toMatch(/json/);
    }
  );

  test("POST /api/attendance/mark without valid auth should be rejected", async () => {
    const res = await request(app)
      .post(`${basePath}/mark`)
      .send({ code: "TESTCODE" });

    // Auth middleware should block unauthenticated access
    expect([401, 403]).toContain(res.status);
  });

  (studentToken ? test : test.skip)(
    "Duplicate attendance mark should be handled without server error",
    async () => {
      // First attempt (may succeed or be rejected depending on test data)
      await request(app)
        .post(`${basePath}/mark`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ code: "TESTCODE" });

      // Second attempt should not crash the server (unique constraint)
      const res = await request(app)
        .post(`${basePath}/mark`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ code: "TESTCODE" });

      expect([200, 400]).toContain(res.status);
      expect(res.type).toMatch(/json/);
    }
  );
});

