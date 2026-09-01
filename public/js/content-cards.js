/**
 * Splits long, markdown-rendered tab content into individual swipeable
 * cards — one per H3-level section — instead of one continuous scroll of
 * stacked sections. Direct roadmap feedback: a tab like Prepare had grown
 * to nine distinct topics concatenated one after another; a casual visitor
 * had to scroll past all of them to find anything, and it read as a wall
 * of text regardless of the per-section card background added earlier.
 *
 * Runs once dynamicContent.js has finished rendering every content div
 * (bungendore:content-ready) — it transplants the already-rendered DOM
 * nodes (not re-parsed text) into new card elements, so links, the
 * DOMPurify-sanitized markup, and anything else already in there survives
 * unchanged. The original source divs are hidden, not removed, so nothing
 * else that references them by id breaks.
 */

/**
 * Groups a container's direct children into { titleEl, bodyEls[] } cards,
 * splitting at each <h3>. Content before the first <h3> (there isn't any
 * in today's content, but a future edit might add a lead paragraph) becomes
 * its own untitled card rather than being silently dropped.
 */
function extractCardsFromContainer(container) {
  const cards = [];
  let current = null;

  Array.from(container.children).forEach((child) => {
    if (child.tagName === "H3") {
      current = { titleEl: child, bodyEls: [] };
      cards.push(current);
    } else {
      if (!current) {
        current = { titleEl: null, bodyEls: [] };
        cards.push(current);
      }
      current.bodyEls.push(child);
    }
  });

  return cards;
}

function buildCardElement(card, options) {
  const article = document.createElement("article");
  article.className = "content-card";
  if (options && options.caution) {
    article.classList.add("content-card--caution");
  }
  if (card.titleEl) article.appendChild(card.titleEl);
  card.bodyEls.forEach((el) => article.appendChild(el));
  return article;
}

/**
 * @param {string} mountId - id of the (initially empty) element the
 *   carousel is built into.
 * @param {Array<{id: string, caution?: boolean}>} sources - content div ids
 *   to pull cards from, in display order. `caution: true` marks a source
 *   whose cards get the amber "last resort" treatment (Neighbourhood Safer
 *   Place) instead of the default neutral card background.
 */
function buildContentCardCarousel(mountId, sources) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const cardEls = [];
  sources.forEach((source) => {
    const sourceDiv = document.getElementById(source.id);
    if (!sourceDiv) return;
    extractCardsFromContainer(sourceDiv).forEach((card) => {
      cardEls.push(buildCardElement(card, { caution: source.caution }));
    });
    // Hide, don't remove — anything else that still queries this id by
    // element (none today, but no reason to force a DOM-removal risk) finds
    // an empty, hidden node rather than nothing at all.
    sourceDiv.hidden = true;
  });

  if (cardEls.length === 0) return;

  const wrapper = document.createElement("div");
  wrapper.className = "content-carousel";

  const header = document.createElement("div");
  header.className = "content-carousel__header";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "content-carousel__arrow content-carousel__arrow--prev";
  prevBtn.setAttribute("aria-label", "Previous section");
  prevBtn.innerHTML = "<i class=\"fas fa-chevron-left\" aria-hidden=\"true\"></i>";

  const counter = document.createElement("p");
  counter.className = "content-carousel__counter";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "content-carousel__arrow content-carousel__arrow--next";
  nextBtn.setAttribute("aria-label", "Next section");
  nextBtn.innerHTML = "<i class=\"fas fa-chevron-right\" aria-hidden=\"true\"></i>";

  header.appendChild(prevBtn);
  header.appendChild(counter);
  header.appendChild(nextBtn);

  const track = document.createElement("div");
  track.className = "content-carousel__track";
  track.setAttribute("role", "list");
  cardEls.forEach((card) => {
    card.setAttribute("role", "listitem");
    track.appendChild(card);
  });

  wrapper.appendChild(header);
  wrapper.appendChild(track);
  mount.appendChild(wrapper);

  function currentCardIndex() {
    // The card whose left edge is closest to the track's own scroll
    // position is "current" — works with native scroll-snap regardless of
    // whether the visitor got there by arrow click, swipe, or drag.
    let closestIndex = 0;
    let closestDistance = Infinity;
    cardEls.forEach((card, index) => {
      const distance = Math.abs(card.offsetLeft - track.scrollLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    return closestIndex;
  }

  function updateCounter() {
    counter.textContent = currentCardIndex() + 1 + " / " + cardEls.length;
  }

  function scrollToIndex(index) {
    const clamped = Math.max(0, Math.min(cardEls.length - 1, index));
    track.scrollTo({ left: cardEls[clamped].offsetLeft, behavior: "smooth" });
  }

  prevBtn.addEventListener("click", () => scrollToIndex(currentCardIndex() - 1));
  nextBtn.addEventListener("click", () => scrollToIndex(currentCardIndex() + 1));

  // Native scroll (swipe, drag, trackpad) also has to keep the counter
  // honest — arrow clicks aren't the only way to move between cards.
  let scrollUpdateTimer;
  track.addEventListener("scroll", () => {
    clearTimeout(scrollUpdateTimer);
    scrollUpdateTimer = setTimeout(updateCounter, 100);
  });

  updateCounter();
}

document.addEventListener("bungendore:content-ready", () => {
  buildContentCardCarousel("prepareCardCarousel", [
    { id: "prepareContent" },
    { id: "bushfireRiskContent" },
    { id: "neighbourhoodSaferPlaceContent", caution: true },
    { id: "animalsInBushfireContent" },
  ]);
});
