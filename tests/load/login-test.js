import http from "k6/http";
import { check, sleep } from "k6";

// How to run:
//   BASE_URL=http://localhost:4000 npx k6 run backend/tests/load/login-test.js
// Or from backend package.json (after adding a script): npm run load:test

export const options = {
  scenarios: {
    login_ramp: {
      executor: "ramping-vus",
      startVUs: 50,
      stages: [
        { duration: "60s", target: 100 },
        { duration: "60s", target: 200 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    // Infra-level error threshold: treat any HTTP status < 500 as success.
    checks: ["rate>0.99"], // error_rate < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

function randomStudent() {
  const id = Math.floor(Math.random() * 1000) + 1;
  return {
    email: `student${id}@example.com`,
    password: "Password123!",
  };
}

export default function () {
  const payload = randomStudent();

  const res = http.post(
    `${BASE_URL}/api/auth/login`,
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

  sleep(1);
}

