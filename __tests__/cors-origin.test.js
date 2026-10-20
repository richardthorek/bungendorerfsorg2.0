/**
 * Tests for api/shared/corsOrigin.js — the origin allow-list behind the contact
 * endpoint's CORS headers. The contact form must work from our own origins and
 * must never be callable from an arbitrary website.
 */

const { corsHeadersFor } = require("../api/shared/corsOrigin");

describe("corsHeadersFor", () => {
  test("echoes the production origin", () => {
    expect(corsHeadersFor("https://www.bungendorerfs.org")).toEqual({
      Vary: "Origin",
      "Access-Control-Allow-Origin": "https://www.bungendorerfs.org",
    });
  });

  test("echoes the local dev origin", () => {
    expect(corsHeadersFor("http://localhost:3000")["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:3000"
    );
  });

  test("echoes this project's PR preview hostname", () => {
    const origin = "https://lively-flower-0577f4700-129.eastasia.5.azurestaticapps.net";
    expect(corsHeadersFor(origin)["Access-Control-Allow-Origin"]).toBe(origin);
  });

  test("echoes this project's livedev hostname", () => {
    const origin = "https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net";
    expect(corsHeadersFor(origin)["Access-Control-Allow-Origin"]).toBe(origin);
  });

  test("omits Allow-Origin for a foreign origin", () => {
    const headers = corsHeadersFor("https://evil.example.com");
    expect(headers).not.toHaveProperty("Access-Control-Allow-Origin");
    expect(headers.Vary).toBe("Origin");
  });

  test("omits Allow-Origin for a look-alike hostname", () => {
    expect(corsHeadersFor("https://bungendorerfs.org.evil.example")).not.toHaveProperty(
      "Access-Control-Allow-Origin"
    );
    expect(
      corsHeadersFor("https://lively-flower-0577f4700-129.eastasia.5.azurestaticapps.net.evil.example")
    ).not.toHaveProperty("Access-Control-Allow-Origin");
  });

  test("omits Allow-Origin when there is no Origin header", () => {
    expect(corsHeadersFor(undefined)).not.toHaveProperty("Access-Control-Allow-Origin");
  });

  test("never sends a wildcard", () => {
    ["https://evil.example.com", undefined, "https://www.bungendorerfs.org"].forEach((origin) => {
      expect(corsHeadersFor(origin)["Access-Control-Allow-Origin"]).not.toBe("*");
    });
  });
});
