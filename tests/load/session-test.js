import http from "k6/http";
import { check, sleep } from "k6";

// How to run:
//   BASE_URL=http://localhost:4000 ADMIN_TOKEN=your_jwt npx k6 run backend/tests/load/session-test.js
//
// This script simulates a small number of admin users creating attendance sessions.

export const options = {
  scenarios: {
    admin_sessions: {
      executor: "per-vu-iterations",
      vus: 10,
      iterations: 1,
      maxDuration: "2m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    // Treat any HTTP status < 500 as success for infra-level error rate.
    checks: ["rate>0.99"], // error_rate < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";

function buildSessionPayload() {
  const now = new Date();
  const start = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration

  const courseId = Math.floor(Math.random() * 20) + 1;

  return {
    courseId,
    title: `Auto test session for course ${courseId}`,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    location: "Room 101",
    mode: "biometric",
  };
}

export default function () {
  const payload = buildSessionPayload();

  const headers = {
    "Content-Type": "application/json",
    Origin: "http://localhost:5173",
  };

  if (ADMIN_TOKEN) {
    headers.Authorization = `Bearer ${ADMIN_TOKEN}`;
  }

  const res = http.post(
    `${BASE_URL}/api/admin/session`,
    JSON.stringify(payload),
    { headers },
  );

  const ok = res.status > 0 && res.status < 500;
  check(res, {
    "no server error (status < 500)": () => ok,
  });

  sleep(1);
}

