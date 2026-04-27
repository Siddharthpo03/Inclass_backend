import http from "k6/http";
import { check, sleep } from "k6";

// How to run:
//   BASE_URL=http://localhost:4000 npx k6 run backend/tests/load/attendance-test.js
// From backend package.json:
//   npm run load:test

export const options = {
  scenarios: {
    attendance_burst: {
      executor: "constant-arrival-rate",
      rate: 5, // 5 requests per second ≈ 300 requests / 60 seconds
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    // Treat any HTTP status < 500 as success for infra-level error_rate.
    // Functional validation (e.g. auth / business rules) is out of scope here.
    checks: ["rate>0.99"], // error_rate < 1% (no 5xx)
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

// Example realistic payload for attendance marking
function buildAttendancePayload() {
  const studentId = Math.floor(Math.random() * 300) + 1;
  const courseId = Math.floor(Math.random() * 20) + 1;
  const sessionId = Math.floor(Math.random() * 50) + 1;

  return {
    studentId,
    courseId,
    sessionId,
    status: "present",
    method: "biometric",
    // Use ISO timestamp; backend typically records server-side time as well.
    timestamp: new Date().toISOString(),
  };
}

export default function () {
  const payload = buildAttendancePayload();

  const res = http.post(
    `${BASE_URL}/api/attendance/mark`,
    JSON.stringify(payload),
    {
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
    },
  );

  const ok = res.status > 0 && res.status < 500;
  check(res, {
    "no server error (status < 500)": () => ok,
  });

  sleep(0.2);
}

