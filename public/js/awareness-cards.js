/**
 * Homepage Prepare/Membership/Events carousel — no tab metaphor. Admin-
 * managed cards (api/content/awarenessCards) rotate one at a time,
 * Instagram/TikTok-story style, with any imminent training date woven in
 * more often than evergreen content. See docs/WEBSITE_ROADMAP.md Bet 1
 * narrowing and the option-c-story-rail mockup this implements.
 */
(function () {
  "use strict";

  const MOUNT_ID = "awarenessCarousel";
  const AUTOPLAY_MS = 6000;
  const WEEKDAYS = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };
  const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };
  const PILLAR_LABEL = { prepare: "Prepare", membership: "Membership", events: "Events" };

  function fetchJson(path) {
    return fetch((window.getApiBaseUrl ? window.getApiBaseUrl() : "") + path).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /* ---------------------------------------------- next training occurrence */
  // Ported from the retired calendar.js — same rule format ("second-saturday",
  // "every-friday") already used by the admin-edited training schedule.
  function parseRecurrence(rule) {
    const parts = String(rule || "").split("-");
    const weekday = WEEKDAYS[parts[parts.length - 1]];
    if (!weekday) return null;
    if (parts[0] === "every") return { ordinal: null, weekday };
    const ordinal = ORDINALS[parts[0]];
    return ordinal ? { ordinal, weekday } : null;
  }

  function nthWeekdayOfMonth(year, month, weekday, ordinal) {
    if (ordinal === -1) {
      let date = luxon.DateTime.local(year, month, 1).endOf("month").startOf("day");
      while (date.weekday !== weekday) date = date.minus({ days: 1 });
      return date;
    }
    let date = luxon.DateTime.local(year, month, 1).startOf("day");
    let count = 0;
    while (date.month === month) {
      if (date.weekday === weekday) {
        count += 1;
        if (count === ordinal) return date;
      }
      date = date.plus({ days: 1 });
    }
    return null;
  }

  function nextOccurrence(recurrence, today) {
    const { ordinal, weekday } = recurrence;
    if (ordinal === null) {
      let date = today;
      while (date.weekday !== weekday) date = date.plus({ days: 1 });
      return date;
    }
    let candidate = nthWeekdayOfMonth(today.year, today.month, weekday, ordinal);
    if (!candidate || candidate < today) {
      const nextMonth = today.plus({ months: 1 });
      candidate = nthWeekdayOfMonth(nextMonth.year, nextMonth.month, weekday, ordinal);
    }
    return candidate;
  }

  function trainingToFeaturedCards(trainingItems) {
    const today = luxon.DateTime.now().setZone("Australia/Sydney").startOf("day");
    return (Array.isArray(trainingItems) ? trainingItems : [])
      .map((item) => {
        const recurrence = parseRecurrence(item.recurrence);
        const nextDate = recurrence ? nextOccurrence(recurrence, today) : null;
        if (!nextDate) return null;
        const dateLabel = nextDate.toLocaleString(luxon.DateTime.DATE_MED_WITH_WEEKDAY);
        return {
          pillar: "membership",
          icon: "fa-calendar-check",
          title: "Training: " + item.title,
          body:
            "Next: " +
            dateLabel +
            (item.time ? ", " + item.time : "") +
            (item.location ? " — " + item.location : ""),
          photo: "",
          caution: false,
          _sortDate: nextDate,
        };
      })
      .filter(Boolean);
  }

  /* --------------------------------------------------------- rotation order */
  // Every 3rd slot is reserved for the next not-yet-shown featured (dated)
  // card, round robin — dated content is seen roughly 3x as often as any one
  // evergreen item, and is simply absent from the weave when there's nothing
  // dated coming up soon rather than leaving a stale placeholder.
  function buildPlayOrder(evergreen, featured) {
    const order = [];
    let f = 0;
    evergreen.forEach((card, i) => {
      order.push(card);
      if (featured.length && (i + 1) % 3 === 0) {
        order.push(featured[f % featured.length]);
        f++;
      }
    });
    return order;
  }

  /* --------------------------------------------------------------- render */
  function renderMarkdown(md) {
    return DOMPurify.sanitize(marked.parse(md || ""));
  }

  // Two visible cards side by side once there's genuinely enough width for a
  // second one to breathe (not just stretch the first one's whitespace) —
  // sliding by one card at a time, so every advance reveals exactly one new
  // card rather than swapping the whole pair out at once.
  const DUAL_QUERY = "(min-width: 1600px)";
  function getSlotCount() {
    return window.matchMedia(DUAL_QUERY).matches ? 2 : 1;
  }

  function populateCard(cardEl, card) {
    cardEl.dataset.pillar = card.pillar;
    cardEl.classList.toggle("story-rail__card--caution", !!card.caution);
    cardEl.innerHTML = "";

    // Icon lives in its own column so the text column can genuinely widen
    // on large screens instead of the icon sitting above a narrow text
    // island in the middle of a much wider card.
    const icon = document.createElement("i");
    icon.className = "fas " + card.icon + " story-rail__icon";
    icon.setAttribute("aria-hidden", "true");
    cardEl.appendChild(icon);

    const text = document.createElement("div");
    text.className = "story-rail__text";

    const pillarTag = document.createElement("span");
    pillarTag.className = card._sortDate ? "story-rail__featured-tag" : "story-rail__pillar";
    pillarTag.textContent = card._sortDate ? "Coming up" : PILLAR_LABEL[card.pillar] || card.pillar;
    text.appendChild(pillarTag);

    const title = document.createElement("h2");
    title.className = "story-rail__title";
    title.textContent = card.title;
    text.appendChild(title);

    const body = document.createElement("div");
    body.className = "story-rail__body";
    body.innerHTML = renderMarkdown(card.body);
    text.appendChild(body);

    if (card.photo) {
      const img = document.createElement("img");
      img.className = "story-rail__photo";
      img.src = card.photo;
      img.alt = card.title;
      img.loading = "lazy";
      text.appendChild(img);
    }

    cardEl.appendChild(text);
  }

  function buildCarousel(mount, order) {
    const wrapper = document.createElement("div");
    wrapper.className = "story-rail";

    const segments = document.createElement("div");
    segments.className = "story-rail__segments";

    const stage = document.createElement("div");
    stage.className = "story-rail__stage";

    const zoneLeft = document.createElement("button");
    zoneLeft.type = "button";
    zoneLeft.className = "story-rail__zone story-rail__zone--left";
    zoneLeft.setAttribute("aria-label", "Previous");

    const zoneRight = document.createElement("button");
    zoneRight.type = "button";
    zoneRight.className = "story-rail__zone story-rail__zone--right";
    zoneRight.setAttribute("aria-label", "Next");

    const track = document.createElement("div");
    track.className = "story-rail__track";
    const cardEls = [0, 1].map(() => {
      const cardEl = document.createElement("div");
      cardEl.className = "story-rail__card";
      track.appendChild(cardEl);
      return cardEl;
    });

    stage.appendChild(zoneLeft);
    stage.appendChild(zoneRight);
    stage.appendChild(track);

    const filmstrip = document.createElement("div");
    filmstrip.className = "story-rail__filmstrip";

    const pauseBtn = document.createElement("button");
    pauseBtn.type = "button";
    pauseBtn.className = "story-rail__pause";
    pauseBtn.textContent = "Pause";

    wrapper.appendChild(segments);
    wrapper.appendChild(stage);
    wrapper.appendChild(filmstrip);
    wrapper.appendChild(pauseBtn);
    mount.appendChild(wrapper);

    const segEls = order.map(() => {
      const seg = document.createElement("button");
      seg.type = "button";
      const fill = document.createElement("span");
      fill.className = "fill";
      seg.appendChild(fill);
      segments.appendChild(seg);
      return seg;
    });

    const thumbEls = order.map((card) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "story-rail__thumb" + (card.caution ? " story-rail__thumb--caution" : "");
      thumb.title = card.title;
      const icon = document.createElement("i");
      icon.className = "fas " + card.icon;
      icon.setAttribute("aria-hidden", "true");
      thumb.appendChild(icon);
      filmstrip.appendChild(thumb);
      return thumb;
    });

    let index = Math.floor(Math.random() * order.length); // randomised starting point
    let playing = true;
    let timer = null;

    function render() {
      const slots = getSlotCount();
      track.classList.toggle("story-rail__track--dual", slots === 2);

      populateCard(cardEls[0], order[index]);
      cardEls[1].hidden = slots < 2;
      if (slots === 2) {
        populateCard(cardEls[1], order[(index + 1) % order.length]);
      }

      // Every segment's fill is reset here, not just the "done" class —
      // startSegmentFill() drives the current segment's fill via an inline
      // style (needed for the linear-timed animation), and inline styles
      // beat the CSS class rule. Without this reset, a segment visited
      // earlier keeps showing its last inline width forever once you
      // navigate backward past it, even after its "done" class is removed.
      segEls.forEach((seg, i) => {
        seg.classList.toggle("done", i < index);
        if (i !== index) {
          const fill = seg.querySelector(".fill");
          fill.style.transition = "none";
          fill.style.width = i < index ? "100%" : "0%";
        }
      });
      thumbEls.forEach((t, i) => {
        const active = slots === 2 ? i === index || i === (index + 1) % order.length : i === index;
        t.classList.toggle("active", active);
      });
    }

    function startSegmentFill() {
      const fill = segEls[index].querySelector(".fill");
      fill.style.transition = "none";
      fill.style.width = "0%";
      requestAnimationFrame(() => {
        fill.style.transition = "width " + AUTOPLAY_MS + "ms linear";
        fill.style.width = "100%";
      });
    }

    function goTo(i) {
      index = (i + order.length) % order.length;
      render();
      startSegmentFill();
    }
    function next() {
      goTo(index + 1);
    }
    function prev() {
      goTo(index - 1);
    }
    function restart() {
      clearTimeout(timer);
      // Autoplay never depends on a click/hover — it's on its own timer, so
      // this runs unattended on a kiosk/signage screen. Manual interaction
      // (zones, thumbnails, pause) only ever re-arms or overrides that timer.
      // The timeout re-arms itself on every fire (not just on manual
      // interaction) — a bare setTimeout(next, ...) only ever advances once,
      // since next() itself doesn't loop.
      if (playing) {
        timer = setTimeout(() => {
          next();
          restart();
        }, AUTOPLAY_MS);
      }
    }

    zoneLeft.addEventListener("click", () => {
      prev();
      restart();
    });
    zoneRight.addEventListener("click", () => {
      next();
      restart();
    });
    segEls.forEach((seg, i) =>
      seg.addEventListener("click", () => {
        goTo(i);
        restart();
      })
    );
    thumbEls.forEach((thumb, i) =>
      thumb.addEventListener("click", () => {
        goTo(i);
        restart();
      })
    );
    pauseBtn.addEventListener("click", () => {
      playing = !playing;
      pauseBtn.textContent = playing ? "Pause" : "Play";
      if (playing) startSegmentFill();
      restart();
    });

    let lastSlotCount = getSlotCount();
    window.addEventListener("resize", () => {
      const slots = getSlotCount();
      if (slots !== lastSlotCount) {
        lastSlotCount = slots;
        render();
      }
    });

    render();
    startSegmentFill();
    restart();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) return;

    Promise.all([
      fetchJson("/api/content/awarenessCards").catch(() => []),
      fetchJson("/api/content/training").catch(() => []),
    ]).then(([cards, training]) => {
      const active = (Array.isArray(cards) ? cards : [])
        .filter((c) => c.active !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      const now = luxon.DateTime.now().setZone("Australia/Sydney");
      const datedCards = [];
      const evergreen = [];
      active.forEach((card) => {
        if (card.eventDate) {
          const d = luxon.DateTime.fromISO(card.eventDate, { zone: "Australia/Sydney" });
          if (d.isValid && d >= now.startOf("day")) {
            datedCards.push({ ...card, _sortDate: d });
            return;
          }
        }
        evergreen.push(card);
      });

      const featured = datedCards
        .concat(trainingToFeaturedCards(training))
        .sort((a, b) => a._sortDate - b._sortDate);

      const order = buildPlayOrder(evergreen, featured);
      if (order.length === 0) return; // nothing to show — leave the mount empty, not a broken shell

      buildCarousel(mount, order);
    });
  });
})();
