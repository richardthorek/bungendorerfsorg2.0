/**
 * Sign-in code email — the rendered code must stay copy-paste-friendly.
 * The original bug wedged a thin space (U+2009) between every digit, so a
 * paste of the code carried invisible whitespace the sign-in screen rejected.
 */

const { buildCodeEmail } = require("../api/shared/otpEmail");

describe("buildCodeEmail", () => {
  const { subject, html, plainText } = buildCodeEmail("482913", 10);

  test("HTML renders the code as six contiguous digits", () => {
    // Would have been ">4 8 2 9 1 3</p>" (thin spaces) under the old bug —
    // this substring only exists if nothing separates the digits.
    expect(html).toContain(">482913</p>");
  });

  test("plain text and subject carry the bare code", () => {
    expect(plainText).toContain("Code: 482913");
    expect(subject).toBe("482913 is your Bungendore RFS sign-in code");
  });
});
