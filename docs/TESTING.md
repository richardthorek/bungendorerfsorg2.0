# Testing Guide

This document describes the testing infrastructure and practices for the Bungendore RFS website.

---

## Table of Contents

- [Overview](#overview)
- [Testing Stack](#testing-stack)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Coverage](#test-coverage)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)

---

## Overview

The project uses **Jest** (jsdom) with **@testing-library** utilities for DOM
testing. Tests live in `__tests__/` at the repo root.

**Suites (`__tests__/`):**

| Suite | Covers |
| --- | --- |
| `validation.test.js` | contact-form validation (client + server rules) |
| `error-handler.test.js` | `public/js/error-handler.js` |
| `admin-nav.test.js` | members'-area view switching |
| `members-auth.test.js` | sign-in codes, sessions, `handleAuth*` / `handleMembers*` / `handleDuty*` |
| `otp-email.test.js` | `buildCodeEmail` — the sign-in code stays copy-paste-safe |
| `contact-notify.test.js` | ACS contact email (`api/contact/notify.js`) |
| `duty-alert.test.js` | brigade-phone change-alert email |
| `clarity-insights.test.js` | Clarity response normaliser + the budget-limited refresh gate |

Most new logic lives in `api/shared/`, so most new tests exercise those modules
with fakes rather than the DOM (see [Testing the shared handlers](#testing-the-shared-api-handlers)).

**Test Philosophy:**

- Test behavior, not implementation
- Focus on user-facing functionality
- Maintain fast test execution
- Keep tests simple and readable

---

## Testing Stack

### Core Dependencies

```json
{
  "jest": "^30.4.2",
  "jest-environment-jsdom": "^30.4.1",
  "@testing-library/dom": "^10.4.0",
  "@testing-library/jest-dom": "^7.0.0"
}
```

### Configuration

`jest.config.js` (jsdom env; `testMatch` picks up **everything** under
`__tests__/`, so helper files there must be self-contained). `globals` pre-stubs
`DOMPurify.sanitize`, `L`, `marked`, `luxon` so front-end modules load without a
browser. `collectCoverageFrom` covers `public/js/**` + `server.js` — the
`api/shared/` modules are exercised by tests but not in the coverage number.

---

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test error-handler.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="validation"
```

`npm run build` (lint + `test:coverage`) is the local pre-merge gate and is what
CI runs.

---

## Testing the shared API handlers

The members'-area logic (`api/shared/handlers.js`, `store.js`, `aiCopy.js`,
`clarityInsights.js`, `otpEmail.js`) is backend-agnostic, so tests import it
directly and replace its collaborators with fakes:

```javascript
// jest.mock the storage layer with an in-memory implementation
jest.mock("../api/shared/store", () => ({
  async getMember(email) { return mockDb.members.get(email) || null; },
  // …only the functions the handler under test calls
}));

// stub network + email
global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
jest.mock("../api/shared/otpEmail", () => ({ sendSignInCode: jest.fn() }));

const handlers = require("../api/shared/handlers");
const res = await handlers.handleAuthVerify(req({ email, code }));
expect(res.status).toBe(200);
```

`members-auth.test.js` is the reference for the storage fake + a `req()` helper;
`clarity-insights.test.js` shows mocking `fetch` and asserting the refresh-budget
gate. Never let a test make a real network call.

---

## Writing Tests

### Test Structure

```javascript
describe("Feature Name", () => {
  // Setup that runs before each test
  beforeEach(() => {
    // Initialize test environment
  });

  // Cleanup that runs after each test
  afterEach(() => {
    // Clean up resources
  });

  describe("Specific functionality", () => {
    test("should do something specific", () => {
      // Arrange: Set up test data
      const input = "test data";

      // Act: Execute the function
      const result = functionUnderTest(input);

      // Assert: Verify the result
      expect(result).toBe(expected);
    });
  });
});
```

### Example: Testing a Utility Function

```javascript
// __tests__/utils.test.js
describe("getUserFriendlyErrorMessage", () => {
  test("should return connection error for fetch failures", () => {
    const error = new Error("Failed to fetch");
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("check your internet connection");
  });

  test("should return not found for 404 errors", () => {
    const error = new Error("HTTP error! status: 404");
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("could not be found");
  });
});
```

### Example: Testing DOM Manipulation

```javascript
// __tests__/error-display.test.js
describe("showErrorMessage", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>';
  });

  test("should display error in container", () => {
    showErrorMessage("container", "Test error");

    const container = document.getElementById("container");
    expect(container.innerHTML).toContain("Test error");
    expect(container.innerHTML).toContain("error-banner");
  });
});
```

### Example: Testing Form Validation

```javascript
// __tests__/form-validation.test.js
describe("validateContactForm", () => {
  test("should reject invalid email", () => {
    const data = {
      name: "John Doe",
      email: "invalid-email",
      message: "Test message",
    };

    const errors = validateContactForm(data);

    expect(errors).toContain("Please enter a valid email address");
  });

  test("should accept valid form", () => {
    const data = {
      name: "John Doe",
      email: "john@example.com",
      message: "This is a valid message",
    };

    const errors = validateContactForm(data);

    expect(errors.length).toBe(0);
  });
});
```

---

## Test Coverage

### Viewing Coverage Reports

After running `npm run test:coverage`:

1. **Terminal output:** Summary statistics
2. **HTML report:** Open `coverage/lcov-report/index.html` in browser
3. **CI integration:** Coverage uploaded to Codecov (optional)

### Coverage

There is no hard coverage gate — `test:coverage` runs in CI for the report, and
Codecov upload is best-effort (`continue-on-error`). Aim to cover new
branch logic and error paths in any module you touch; don't chase a number on
DOM glue or third-party wrappers.

### What to Test

**High Priority:**

- ✅ Form validation logic
- ✅ Error handling utilities
- ✅ Data transformation functions
- 🔄 API response parsing
- 🔄 User interactions

**Lower Priority:**

- UI styling (manual testing)
- Third-party library functionality
- Simple getters/setters

---

## CI/CD Integration

### GitHub Actions Workflow

`.github/workflows/ci.yml` runs on every push to `main` / `copilot/**` and every
PR into `main`. On Node 20 it runs, in order:

1. `npm ci`
2. `npm run lint` (ESLint — blocking)
3. `npm run test:coverage` (blocking)
4. `codecov/codecov-action@v7` — best-effort, `continue-on-error: true`
5. `npm audit --omit=dev` report (non-blocking)
6. `npm audit --omit=dev --audit-level=moderate` — **blocking** gate

There is no Prettier step in CI — run `npm run format:check` locally.

Deployment is a separate workflow
(`azure-static-web-apps-lively-flower-0577f4700.yml`) triggered on `workflow_run`
after CI passes.

### Viewing CI Results

1. Go to GitHub repository → Actions tab
2. Click on latest workflow run
3. View test results and coverage

---

## Best Practices

### 1. Test Organization

Flat — one `*.test.js` per unit of behaviour, colocated in `__tests__/`, named
after what it covers (not the source path). Shared fakes are defined inline in
the file that needs them. See the suite table in [Overview](#overview).

### 2. Naming Conventions

- **Test files:** `*.test.js` or `*.spec.js`
- **Test suites:** `describe("Component/Feature Name", ...)`
- **Test cases:** `test("should do something specific", ...)`

### 3. Writing Good Tests

**DO:**

- ✅ Test user-facing behavior
- ✅ Use descriptive test names
- ✅ Keep tests independent
- ✅ Test edge cases and error conditions
- ✅ Mock external dependencies

**DON'T:**

- ❌ Test implementation details
- ❌ Write tests that depend on each other
- ❌ Make actual API calls in unit tests
- ❌ Test third-party library code
- ❌ Ignore failing tests

### 4. Arrange-Act-Assert Pattern

```javascript
test("should calculate total correctly", () => {
  // Arrange: Set up test data
  const items = [10, 20, 30];

  // Act: Execute the function
  const total = calculateTotal(items);

  // Assert: Verify the result
  expect(total).toBe(60);
});
```

### 5. Testing Async Code

```javascript
test("should fetch data successfully", async () => {
  // Mock fetch
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: "test" }),
    })
  );

  const result = await fetchData();

  expect(result.data).toBe("test");
  expect(fetch).toHaveBeenCalledTimes(1);
});
```

### 6. Mocking Global Objects

```javascript
beforeEach(() => {
  // Mock DOMPurify
  global.DOMPurify = {
    sanitize: (html) => html,
  };

  // Mock console methods
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Restore mocks
  jest.restoreAllMocks();
});
```

---

## Common Testing Scenarios

### Testing Error Handling

```javascript
test("should handle API errors gracefully", async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error("Network error")));

  await expect(fetchData()).rejects.toThrow("Network error");

  // Verify error was logged
  expect(console.error).toHaveBeenCalled();
});
```

### Testing Form Submissions

```javascript
test("should submit form successfully", async () => {
  const form = document.createElement("form");
  form.innerHTML = `
    <input name="name" value="John Doe">
    <input name="email" value="john@example.com">
  `;

  const submitHandler = jest.fn();
  form.addEventListener("submit", submitHandler);

  form.dispatchEvent(new Event("submit"));

  expect(submitHandler).toHaveBeenCalled();
});
```

### Testing User Interactions

```javascript
test("should open modal on button click", () => {
  document.body.innerHTML = `
    <button id="openBtn">Open</button>
    <dialog id="modal"></dialog>
  `;

  const button = document.getElementById("openBtn");
  const modal = document.getElementById("modal");

  button.click();

  expect(modal.hasAttribute("open")).toBe(true);
});
```

---

## Troubleshooting

### Tests Failing Locally

1. **Clear Jest cache:**

   ```bash
   npm test -- --clearCache
   ```

2. **Check Node version:**

   ```bash
   node --version  # Should be >= 18
   ```

3. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Tests Pass Locally But Fail in CI

1. Check environment differences (Node version, OS)
2. Look for timing issues (use `waitFor` from @testing-library)
3. Check for file system differences (path separators)
4. Verify no reliance on local files/configuration

### Slow Tests

1. Use `test.only()` to run single test during development
2. Mock expensive operations (API calls, file I/O)
3. Avoid unnecessary setup in `beforeEach`
4. Consider parallel test execution (Jest default)

---

## Future Enhancements

### Planned Improvements

1. **Integration Tests**
   - Test complete user flows
   - Test API endpoint responses
   - Test database interactions (if added)

2. **E2E Tests**
   - Use Playwright or Cypress
   - Test critical user journeys
   - Test across browsers

3. **Visual Regression Tests**
   - Screenshot comparison
   - Detect unintended UI changes

4. **Performance Tests**
   - Lighthouse CI integration
   - Load time monitoring
   - Bundle size tracking

---

## Resources

### Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)

### Learning Resources

- [JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)

---

Update this doc when the testing stack or conventions change (new libraries,
`jest.config.js` changes, new `__tests__/` conventions).
