/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testRegex: "test/.*\\.(e2e-)?spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  testTimeout: 60_000,
  maxWorkers: 1,
  clearMocks: true,
  setupFiles: ["<rootDir>/test/setup-env.ts"],
};
