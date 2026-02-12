/**
 * Tests for error-handler.js utility functions
 */

// Mock DOMPurify
global.DOMPurify = {
  sanitize: (html) => html,
};

describe("Error Handler Utilities", () => {
  // Set up DOM before each test
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="test-container"></div>
      <div id="calendar-container"></div>
    `;
  });

  describe("getUserFriendlyErrorMessage", () => {
    // Load the function from the file
    beforeAll(() => {
      // Read and evaluate the error-handler.js file
      const fs = require("fs");
      const path = require("path");
      const errorHandlerCode = fs.readFileSync(
        path.join(__dirname, "../public/js/error-handler.js"),
        "utf8"
      );
      eval(errorHandlerCode);
      global.getUserFriendlyErrorMessage = getUserFriendlyErrorMessage;
    });

    test("should return connection error message for fetch failures", () => {
      const error = new Error("Failed to fetch");
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain("check your internet connection");
    });

    test("should return not found message for 404 errors", () => {
      const error = new Error("HTTP error! status: 404");
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain("could not be found");
    });

    test("should return server error message for 500 errors", () => {
      const error = new Error("HTTP error! status: 500");
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain("Server error");
    });

    test("should return access denied message for 403 errors", () => {
      const error = new Error("HTTP error! status: 403");
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain("Access denied");
    });

    test("should return generic error message for unknown errors", () => {
      const error = new Error("Unknown error");
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain("unexpected error");
    });
  });

  describe("showErrorMessage", () => {
    beforeAll(() => {
      const fs = require("fs");
      const path = require("path");
      const errorHandlerCode = fs.readFileSync(
        path.join(__dirname, "../public/js/error-handler.js"),
        "utf8"
      );
      eval(errorHandlerCode);
      global.showErrorMessage = showErrorMessage;
    });

    test("should display error message in container", () => {
      showErrorMessage("test-container", "Test error message");
      const container = document.getElementById("test-container");
      expect(container.innerHTML).toContain("Test error message");
      expect(container.innerHTML).toContain("error-banner");
    });

    test("should include retry button by default", () => {
      showErrorMessage("test-container", "Test error message");
      const container = document.getElementById("test-container");
      expect(container.innerHTML).toContain("Retry");
    });

    test("should not include retry button when showRetry is false", () => {
      showErrorMessage("test-container", "Test error message", false);
      const container = document.getElementById("test-container");
      expect(container.innerHTML).not.toContain("Retry");
    });

    test("should handle missing container gracefully", () => {
      // Should not throw error
      expect(() => {
        showErrorMessage("non-existent-container", "Test error");
      }).not.toThrow();
    });
  });

  describe("showLoadingMessage", () => {
    beforeAll(() => {
      const fs = require("fs");
      const path = require("path");
      const errorHandlerCode = fs.readFileSync(
        path.join(__dirname, "../public/js/error-handler.js"),
        "utf8"
      );
      eval(errorHandlerCode);
      global.showLoadingMessage = showLoadingMessage;
    });

    test("should display loading message", () => {
      showLoadingMessage("test-container");
      const container = document.getElementById("test-container");
      expect(container.innerHTML).toContain("Loading...");
    });

    test("should display custom loading message", () => {
      showLoadingMessage("test-container", "Loading events...");
      const container = document.getElementById("test-container");
      expect(container.innerHTML).toContain("Loading events...");
    });
  });
});
