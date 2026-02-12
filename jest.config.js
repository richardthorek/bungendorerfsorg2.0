module.exports = {
  testEnvironment: "jsdom",
  testMatch: [
    "**/__tests__/**/*.js",
    "**/?(*.)+(spec|test).js"
  ],
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "public/js/**/*.js",
    "server.js",
    "!public/js/**/*.test.js",
    "!public/js/**/*.spec.js"
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/coverage/"
  ],
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  globals: {
    L: {},
    marked: {},
    luxon: {},
    DOMPurify: {
      sanitize: (html) => html
    }
  }
};
