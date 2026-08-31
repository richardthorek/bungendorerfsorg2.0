/**
 * The brigade-phone change alert is opt-in: silent unless DUTY_ALERT_TO is set.
 */

const { sendDutyChangeAlert } = require("../api/shared/dutyAlert");

const change = {
  number: "+61400000000",
  label: "Sandi",
  method: "web",
  setAt: new Date().toISOString(),
};

function fakeClient() {
  const sent = [];
  return {
    sent,
    beginSend: jest.fn(async (m) => {
      sent.push(m);
      return { pollUntilDone: async () => ({ status: "Succeeded", id: "x" }) };
    }),
  };
}

test("no recipient configured → nothing sent", async () => {
  const client = fakeClient();
  const r = await sendDutyChangeAlert(change, {
    env: {
      ACS_CONNECTION_STRING: "c",
      ACS_SENDER_ADDRESS: "s@x",
      CONTACT_NOTIFY_TO: "leadership@x.org",
    },
    clientFactory: () => client,
  });
  expect(r).toEqual({ skipped: true });
  expect(client.beginSend).not.toHaveBeenCalled();
});

test("DUTY_ALERT_TO set → one email, to those recipients", async () => {
  const client = fakeClient();
  await sendDutyChangeAlert(change, {
    env: {
      ACS_CONNECTION_STRING: "c",
      ACS_SENDER_ADDRESS: "s@x",
      DUTY_ALERT_TO: "a@x.org, b@x.org",
    },
    clientFactory: () => client,
  });
  expect(client.beginSend).toHaveBeenCalledTimes(1);
  expect(client.sent[0].recipients.to).toEqual([{ address: "a@x.org" }, { address: "b@x.org" }]);
  expect(client.sent[0].content.subject).toMatch(/Brigade phone/);
});
