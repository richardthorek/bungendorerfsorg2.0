/**
 * Tests for public/js/incident-changes.js: what changed between two refreshes of
 * the incident feed, and how long the change is shown.
 */

require("../public/js/incident-changes.js");
const { createTracker, describeChange, CHANGE_WINDOW_MS } = window.IncidentChanges;

const MIN = 60 * 1000;

function incident(title, { category = "Advice", status = "Under control", size = "10 ha", location = "Bungendore" } = {}) {
  return {
    type: "Feature",
    properties: {
      title,
      category,
      description:
        "ALERT LEVEL: " +
        category +
        "<br/>LOCATION: " +
        location +
        "<br/>STATUS: " +
        status +
        "<br/>SIZE: " +
        size +
        "<br/>",
    },
    geometry: { type: "Point", coordinates: [149.44, -35.25] },
  };
}

function changeOf(features, title) {
  const found = features.find((f) => f.properties.title === title);
  return found ? found._change : undefined;
}

describe("incident change tracking", () => {
  test("the first refresh is a baseline and flags nothing", () => {
    const tracker = createTracker();
    const out = tracker.update([incident("Grass fire", { category: "Watch and Act" })], 0);
    expect(out).toHaveLength(1);
    expect(out[0]._change).toBeUndefined();
  });

  test("a category moving up is an escalation", () => {
    const tracker = createTracker();
    tracker.update([incident("Grass fire", { category: "Advice" })], 0);
    const out = tracker.update([incident("Grass fire", { category: "Watch and Act" })], 3 * MIN);
    expect(changeOf(out, "Grass fire")).toEqual(
      expect.objectContaining({ type: "escalated", from: "Advice", to: "Watch and Act" })
    );
  });

  test("a category moving down is a downgrade", () => {
    const tracker = createTracker();
    tracker.update([incident("Grass fire", { category: "Emergency Warning" })], 0);
    const out = tracker.update([incident("Grass fire", { category: "Watch and Act" })], 3 * MIN);
    expect(changeOf(out, "Grass fire").type).toBe("downgraded");
  });

  test("a status change, such as being controlled, is flagged with both values", () => {
    const tracker = createTracker();
    tracker.update([incident("Grass fire", { status: "Out of control" })], 0);
    const out = tracker.update([incident("Grass fire", { status: "Being controlled" })], 3 * MIN);
    expect(changeOf(out, "Grass fire")).toEqual(
      expect.objectContaining({ type: "status", from: "Out of control", to: "Being controlled" })
    );
  });

  test("a size change is flagged", () => {
    const tracker = createTracker();
    tracker.update([incident("Grass fire", { size: "10 ha" })], 0);
    const out = tracker.update([incident("Grass fire", { size: "45 ha" })], 3 * MIN);
    expect(changeOf(out, "Grass fire")).toEqual(
      expect.objectContaining({ type: "size", from: "10 ha", to: "45 ha" })
    );
  });

  test("an incident that leaves the feed stays, greyed out, as closed", () => {
    const tracker = createTracker();
    tracker.update([incident("Grass fire"), incident("Shed fire")], 0);
    const out = tracker.update([incident("Shed fire")], 3 * MIN);
    expect(out).toHaveLength(2);
    expect(changeOf(out, "Grass fire")).toEqual(expect.objectContaining({ type: "closed" }));
    expect(changeOf(out, "Shed fire")).toBeUndefined();
    expect(describeChange(changeOf(out, "Grass fire"))).toBe("Closed or no longer active");
  });

  test("a change settles after the 15-minute window", () => {
    expect(CHANGE_WINDOW_MS).toBe(15 * MIN);
    const tracker = createTracker();
    tracker.update([incident("Grass fire", { category: "Advice" })], 0);
    tracker.update([incident("Grass fire", { category: "Watch and Act" })], 3 * MIN);

    const stillShown = tracker.update([incident("Grass fire", { category: "Watch and Act" })], 14 * MIN);
    expect(changeOf(stillShown, "Grass fire")).toBeDefined();

    const settled = tracker.update([incident("Grass fire", { category: "Watch and Act" })], 18 * MIN);
    expect(changeOf(settled, "Grass fire")).toBeUndefined();
  });

  test("a closed incident drops off after the window", () => {
    const tracker = createTracker();
    tracker.update([incident("Grass fire")], 0);
    tracker.update([], 3 * MIN);
    const later = tracker.update([], 21 * MIN);
    expect(later).toHaveLength(0);
  });

  test("an incident that comes back is no longer shown as closed", () => {
    const tracker = createTracker();
    tracker.update([incident("Grass fire")], 0);
    tracker.update([], 3 * MIN);
    const back = tracker.update([incident("Grass fire")], 6 * MIN);
    expect(changeOf(back, "Grass fire")).toBeUndefined();
  });

  test("a new incident is not flagged as a change", () => {
    const tracker = createTracker();
    tracker.update([incident("Grass fire")], 0);
    const out = tracker.update([incident("Grass fire"), incident("Shed fire", { category: "Watch and Act" })], 3 * MIN);
    expect(changeOf(out, "Shed fire")).toBeUndefined();
  });

  test("describeChange produces plain-language labels", () => {
    expect(describeChange({ type: "escalated", from: "Advice", to: "Watch and Act" })).toBe(
      "Escalated: Advice to Watch and Act"
    );
    expect(describeChange({ type: "status", from: "", to: "Under control" })).toBe("Status: Under control");
    expect(describeChange(undefined)).toBe("");
  });
});
