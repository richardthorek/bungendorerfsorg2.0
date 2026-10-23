/* exported IncidentChanges */

/**
 * Change tracking for the live incident feed.
 *
 * Each refresh is compared with the one before it. Incidents are identified by
 * title and LOCATION, because the feed carries no stable id. A change is shown
 * for CHANGE_WINDOW_MS after it is first seen, then the incident settles back to
 * its normal look:
 *
 *   escalated   category moved up (Advice -> Watch and Act -> Emergency Warning)
 *   downgraded  category moved down
 *   status      STATUS text changed, e.g. "Out of control" -> "Being controlled"
 *   size        SIZE text changed
 *   closed      the incident has left the feed; shown greyed out until it settles
 *
 * The first refresh is a baseline, so nothing is flagged on page load.
 */
(function (root) {
  const CHANGE_WINDOW_MS = 15 * 60 * 1000;

  // Ordered so that "Watch and Act" is matched before anything it might contain.
  const CATEGORY_RANK = [
    ["Advice", 1],
    ["Watch and Act", 2],
    ["Emergency Warning", 3],
  ];

  function rankOf(category) {
    const match = CATEGORY_RANK.find(function (pair) {
      return String(category || "").includes(pair[0]);
    });
    return match ? match[1] : 0;
  }

  function fieldOf(description, name) {
    const match = new RegExp(name + ": ([^<]*)").exec(String(description || ""));
    return match ? match[1].trim() : "";
  }

  function snapshotOf(feature) {
    const props = feature.properties || {};
    const description = props.description || "";
    return {
      title: props.title || "",
      location: fieldOf(description, "LOCATION"),
      category: props.category || "",
      rank: rankOf(props.category),
      status: fieldOf(description, "STATUS"),
      size: fieldOf(description, "SIZE"),
    };
  }

  function keyOf(snapshot) {
    return snapshot.title + "|" + snapshot.location;
  }

  // The first difference found wins. Escalation outranks everything else because
  // it is the one a resident most needs to notice.
  function diffSnapshots(before, after) {
    if (after.rank > before.rank) {
      return { type: "escalated", from: before.category, to: after.category };
    }
    if (after.rank < before.rank) {
      return { type: "downgraded", from: before.category, to: after.category };
    }
    if (after.status !== before.status) {
      return { type: "status", from: before.status, to: after.status };
    }
    if (after.size !== before.size) {
      return { type: "size", from: before.size, to: after.size };
    }
    return null;
  }

  function withChange(feature, change) {
    return Object.assign({}, feature, { _change: change });
  }

  function createTracker(options) {
    const windowMs = (options && options.windowMs) || CHANGE_WINDOW_MS;
    let previous = null; // Map<key, { feature, snapshot }> from the last refresh
    const transitions = new Map(); // Map<key, { type, at, from, to, feature? }>

    function update(features, now) {
      const current = new Map();
      (Array.isArray(features) ? features : []).forEach(function (feature) {
        const snapshot = snapshotOf(feature);
        current.set(keyOf(snapshot), { feature: feature, snapshot: snapshot });
      });

      if (previous) {
        current.forEach(function (entry, key) {
          const before = previous.get(key);
          if (!before) {
            // Not a change to anything we knew about last time. If it had gone
            // missing earlier and is back, its "closed" mark is now stale.
            if (transitions.has(key) && transitions.get(key).type === "closed") {
              transitions.delete(key);
            }
            return;
          }
          const diff = diffSnapshots(before.snapshot, entry.snapshot);
          if (diff) {
            transitions.set(key, Object.assign({ at: now }, diff));
          }
        });

        previous.forEach(function (entry, key) {
          if (!current.has(key)) {
            transitions.set(key, {
              type: "closed",
              at: now,
              feature: entry.feature,
              from: entry.snapshot.status,
              to: "",
            });
          }
        });
      }

      transitions.forEach(function (transition, key) {
        if (now - transition.at >= windowMs) transitions.delete(key);
      });

      previous = current;

      const out = [];
      current.forEach(function (entry, key) {
        const transition = transitions.get(key);
        out.push(transition ? withChange(entry.feature, transition) : entry.feature);
      });
      transitions.forEach(function (transition, key) {
        if (transition.type === "closed" && !current.has(key)) {
          out.push(withChange(transition.feature, transition));
        }
      });
      return out;
    }

    return { update: update };
  }

  /** Plain-language line shown on the card, e.g. "Escalated: Advice to Watch and Act". */
  function describeChange(change) {
    if (!change) return "";
    switch (change.type) {
    case "escalated":
      return "Escalated: " + change.from + " to " + change.to;
    case "downgraded":
      return "Downgraded: " + change.from + " to " + change.to;
    case "status":
      return change.from
        ? "Status changed: " + change.from + " to " + change.to
        : "Status: " + change.to;
    case "size":
      return change.from ? "Size changed: " + change.from + " to " + change.to : "Size: " + change.to;
    case "closed":
      return "Closed or no longer active";
    default:
      return "";
    }
  }

  const api = {
    createTracker: createTracker,
    describeChange: describeChange,
    CHANGE_WINDOW_MS: CHANGE_WINDOW_MS,
  };

  root.IncidentChanges = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
