/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  // Look for tests under the tests/ directory
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/jest.setup.js"],
  // Jest already sets NODE_ENV=test by default, but we document this
  // expectation so the backend can branch on it if needed.
  clearMocks: true,
};

