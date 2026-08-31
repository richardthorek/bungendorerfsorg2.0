/**
 * Jest manual mock for the ACS Email SDK — the real package ships ESM that the
 * CommonJS test runner can't load. Tests that care about send behaviour inject
 * their own client via the `clientFactory` option; this stub just lets the
 * module graph load.
 */

class EmailClient {
  async beginSend() {
    return { pollUntilDone: async () => ({ status: "Succeeded", id: "mock" }) };
  }
}

module.exports = { EmailClient, KnownEmailSendStatus: { Succeeded: "Succeeded" } };
