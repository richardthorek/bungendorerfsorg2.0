/**
 * Tests for the ACS email notification helper used by the contact form.
 */

// The real SDK isn't needed for these tests — every send path is exercised
// through the injectable clientFactory. Stub the module so `require` resolves.
jest.mock("@azure/communication-email", () => ({ EmailClient: jest.fn() }), { virtual: true });

const {
  escapeHtml,
  readConfig,
  buildNotification,
  buildConfirmation,
  sendContactNotifications,
} = require("../api/contact/notify");

const validData = {
  name: "Jane Citizen",
  email: "jane@example.com",
  phone: "0412345678",
  message: "We have a large burn pile at 39 Lake Road and would like some advice.",
};

const fullEnv = {
  ACS_CONNECTION_STRING: "endpoint=https://acs.example.com/;accesskey=abc",
  ACS_SENDER_ADDRESS: "contact@notify.bungendorerfs.org",
  CONTACT_NOTIFY_TO: "committee@example.org",
};

/** Build a fake EmailClient whose beginSend resolves to a given status. */
function fakeClient(status = "Succeeded") {
  const calls = [];
  const client = {
    calls,
    beginSend: jest.fn(async (message) => {
      calls.push(message);
      return { pollUntilDone: async () => ({ status, id: "msg-123" }) };
    }),
  };
  return client;
}

describe("escapeHtml", () => {
  test("escapes HTML-significant characters", () => {
    expect(escapeHtml("<script>\"x\"&'y'")).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;");
  });
});

describe("readConfig", () => {
  test("reports every missing variable", () => {
    const { missing } = readConfig({});
    expect(missing).toEqual(
      expect.arrayContaining(["ACS_CONNECTION_STRING", "ACS_SENDER_ADDRESS", "CONTACT_NOTIFY_TO"])
    );
  });

  test("splits CONTACT_NOTIFY_TO on commas and trims", () => {
    const cfg = readConfig({ ...fullEnv, CONTACT_NOTIFY_TO: " a@x.org , b@x.org " });
    expect(cfg.notifyTo).toEqual(["a@x.org", "b@x.org"]);
    expect(cfg.missing).toHaveLength(0);
  });

  test("confirmation defaults on, disabled only by explicit false", () => {
    expect(readConfig(fullEnv).sendConfirmation).toBe(true);
    expect(readConfig({ ...fullEnv, CONTACT_NOTIFY_CONFIRM: "false" }).sendConfirmation).toBe(
      false
    );
  });
});

describe("buildNotification", () => {
  test("subject names the enquirer and body escapes user input", () => {
    const evil = { ...validData, name: "Jane <b>", message: "hi <img src=x>" };
    const msg = buildNotification(evil, "Mon 1 Sep 2026, 9:00 am");
    expect(msg.subject).toBe("Website enquiry from Jane <b>");
    expect(msg.html).toContain("Jane &lt;b&gt;");
    expect(msg.html).toContain("hi &lt;img src=x&gt;");
    expect(msg.html).not.toContain("<img src=x>");
    // plain-text part keeps the raw message (no HTML there to escape)
    expect(msg.plainText).toContain("hi <img src=x>");
  });

  test("includes the enquiry details and a link back to the site", () => {
    const msg = buildNotification(validData, "Mon 1 Sep 2026, 9:00 am");
    expect(msg.html).toContain("39 Lake Road");
    expect(msg.html).toContain("mailto:jane@example.com");
    expect(msg.html).toContain("https://www.bungendorerfs.org");
    expect(msg.plainText).toContain("39 Lake Road");
  });

  test("newlines in the message become <br> in HTML", () => {
    const msg = buildNotification({ ...validData, message: "line one\nline two" }, "now");
    expect(msg.html).toContain("line one<br>line two");
  });
});

describe("buildConfirmation", () => {
  test("greets by first name and includes the 000 advice", () => {
    const msg = buildConfirmation(validData);
    expect(msg.html).toContain("Thanks Jane,");
    expect(msg.html).toContain("000");
  });
});

describe("sendContactNotifications", () => {
  const silent = { log: () => {}, warn: () => {}, error: () => {} };

  test("throws when configuration is incomplete", async () => {
    await expect(sendContactNotifications(validData, { env: {}, logger: silent })).rejects.toThrow(
      /not configured/
    );
  });

  test("sends committee notification with enquirer as reply-to", async () => {
    const client = fakeClient();
    await sendContactNotifications(validData, {
      env: { ...fullEnv, CONTACT_NOTIFY_CONFIRM: "false" },
      logger: silent,
      clientFactory: () => client,
    });

    expect(client.beginSend).toHaveBeenCalledTimes(1);
    const msg = client.calls[0];
    expect(msg.senderAddress).toBe("contact@notify.bungendorerfs.org");
    expect(msg.recipients.to).toEqual([{ address: "committee@example.org" }]);
    expect(msg.replyTo).toEqual([{ address: "jane@example.com", displayName: "Jane Citizen" }]);
  });

  test("also sends a confirmation to the enquirer when enabled", async () => {
    const client = fakeClient();
    await sendContactNotifications(validData, {
      env: fullEnv,
      logger: silent,
      clientFactory: () => client,
    });

    expect(client.beginSend).toHaveBeenCalledTimes(2);
    expect(client.calls[1].recipients.to).toEqual([
      { address: "jane@example.com", displayName: "Jane Citizen" },
    ]);
  });

  test("a failed confirmation does not fail the request", async () => {
    const client = fakeClient();
    client.beginSend
      .mockImplementationOnce(async (m) => {
        client.calls.push(m);
        return { pollUntilDone: async () => ({ status: "Succeeded", id: "ok" }) };
      })
      .mockImplementationOnce(async () => {
        throw new Error("recipient rejected");
      });

    await expect(
      sendContactNotifications(validData, {
        env: fullEnv,
        logger: silent,
        clientFactory: () => client,
      })
    ).resolves.toEqual({ id: "ok" });
  });

  test("throws when the committee notification does not succeed", async () => {
    const client = fakeClient("Failed");
    await expect(
      sendContactNotifications(validData, {
        env: { ...fullEnv, CONTACT_NOTIFY_CONFIRM: "false" },
        logger: silent,
        clientFactory: () => client,
      })
    ).rejects.toThrow(/status Failed/);
  });
});
