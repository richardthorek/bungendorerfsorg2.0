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

    const content = document.createElement("div");
    content.className = "story-rail__content";

    stage.appendChild(zoneLeft);
    stage.appendChild(zoneRight);
    stage.appendChild(content);

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
      const card = order[index];
      stage.dataset.pillar = card.pillar;
      stage.classList.toggle("story-rail__stage--caution", !!card.caution);

      content.innerHTML = "";
      const pillarTag = document.createElement("span");
      pillarTag.className = card._sortDate ? "story-rail__featured-tag" : "story-rail__pillar";
      pillarTag.textContent = card._sortDate
        ? "Coming up"
        : PILLAR_LABEL[card.pillar] || card.pillar;
      content.appendChild(pillarTag);

      const icon = document.createElement("i");
      icon.className = "fas " + card.icon + " story-rail__icon";
      icon.setAttribute("aria-hidden", "true");
      content.appendChild(icon);

      const title = document.createElement("h2");
      title.className = "story-rail__title";
      title.textContent = card.title;
      content.appendChild(title);

      const body = document.createElement("div");
      body.className = "story-rail__body";
      body.innerHTML = renderMarkdown(card.body);
      content.appendChild(body);

      if (card.photo) {
        const img = document.createElement("img");
        img.className = "story-rail__photo";
        img.src = card.photo;
        img.alt = card.title;
        img.loading = "lazy";
        content.appendChild(img);
      }

      segEls.forEach((seg, i) => seg.classList.toggle("done", i < index));
      thumbEls.forEach((t, i) => t.classList.toggle("active", i === index));
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
      if (playing) timer = setTimeout(next, AUTOPLAY_MS);
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
