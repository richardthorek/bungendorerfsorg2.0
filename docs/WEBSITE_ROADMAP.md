# Bungendore RFS Website — Gold-Standard Roadmap

> A strategic synthesis of five specialist reviews (external data · home-page UX ·
> content & community needs · backend resilience · accessibility & inclusion).
> The path from a good brigade website to the gold standard in emergency public
> information — sequenced honestly. Every load-bearing defect claim below was
> verified against the codebase.
>
> Horizon: one quarter. Audience: the brigade.

---

## 1. Executive verdict

The site is **well ahead of the typical volunteer-brigade website and structurally
one bad afternoon away from failing the people who need it most.** The engineering
is genuinely good for a no-framework static site: a clean Function-proxy security
boundary, a shared-logic layer, a real passwordless admin area, an adaptive
"Command Centre" hero. On a calm day it looks like a gold-standard site.

But gold standard is not measured on a calm day. It is measured at 2pm on a
Catastrophic day when the Kings Highway is smoke-bound, the mobile network is
congested, and a frightened resident on an old phone loads the page. **Today, in
that exact moment, the site can quietly lie.** Three independent reviewers — UX,
backend, and accessibility — converged on the same mechanism without coordinating:
the emergency data can fail silently into a *reassuring* state, it is never
refreshed or timestamped, and the only human-readable incident list is welded to
an 800&nbsp;KB WebGL map that the weakest connections cannot load. On top of that,
the single most important cell on the page — the Warning Level — is a hard-coded
string that no code ever updates.

**Strong bones. Dangerous failure modes. Thin content.** The gap to gold standard
is not a long feature list — it is a short list of safety-critical corrections plus
a few well-chosen bets. This is very achievable for a small team, because the
highest-value fixes are also among the smallest.

---

## 2. Critical safety defects — fix these first, out of roadmap order

Not preferences. Each is a verified mechanism by which the site can mislead a
resident during a fire. They jump the queue.

### 2.1 The site fails *reassuringly* — "No active incidents in our area"

When the incident fetch fails, the UI renders the same friendly empty-state it
shows on a genuinely quiet day. A resident cannot distinguish "nothing is
happening" from "we couldn't reach the data." Three reviewers independently rated
this the top defect. **A fetch error must never render as "0 / none / all clear."**
It must read as an explicit degraded state: *"We can't reach live fire data right
now — check Hazards Near Me or call 000."* A few lines of code, and the single most
important correction on the page.

### 2.2 The Warning Level cell is hard-coded to "None" (verified)

`public/index.html:205` ships `<div id="stripWarningLevel" ...>None</div>` and
**no JavaScript ever writes to it** (only `main.css:1039` references the id). The
most important field on the page is a decorative literal that reads "None" during
an actual Watch and Act or Emergency Warning. The data already exists —
`categoryCounts` is computed in `map.js`. Wire the highest active warning category
into this cell. Small change, enormous stakes.

### 2.3 The readable incident list is coupled to the map bundle (verified)

`populateFireInfoTable()` runs only inside `map.on("load")` (`map.js:858`) and the
flow constructs `new mapboxgl.LngLatBounds()` (`map.js:582`). If Mapbox GL doesn't
load — congested rural 3G, an old phone, a screen reader — **there is no text list
of incidents at all.** The people least able to load WebGL during a fire are
exactly the elderly, disabled, low-literacy and tourist users with the least
margin. Render the list from the GeoJSON first; make the map a progressive
enhancement layered on top. Top equity defect, shares a root cause with 2.1.

### 2.4 No shelter-of-last-resort / Neighbourhood Safer Place information exists anywhere

For a community on one fragile arterial (the Kings Highway) with a late-evacuation
risk profile, the absence of "where do I go if I've left it too late" is a
life-safety content gap. Add the named/mapped Neighbourhood Safer Place as
**static content** (no feed needed) with the unambiguous framing that it is a last
resort, not a plan.

### 2.5 The Prepare content omits the RFS core message: leave early (verified)

`public/Content/prepareContent.md` frames "a prepared home and a clear plan are
your best defence" and **never tells anyone to leave, or that Catastrophic means
leave.** This is the exact messaging that correlates with late-evacuation
fatalities. The rewrite is content work (§3, NEXT), but the *omission* is a safety
defect, so it's flagged here.

> **Common root cause:** 2.1, 2.2 and 2.3 are one bug wearing three hats — the
> emergency-data layer has no honest state model. Fix them together.

> **Correct, not a defect:** an earlier draft questioned the "Fire Permits are
> Suspended" message shown from the HIGH rating in
> `public/Content/AFDRSMessages.json`. Confirmed with the brigade: **in the Southern
> Ranges district permits are suspended from HIGH, so this content is factually
> correct** and stays as-is. (The separate plain-English permits explainer in §3
> Workstream 5 is a content *addition*, not a fix.)

---

## 3. Phased roadmap — NOW / NEXT / LATER

Sequenced so dependencies land first. Impact and Effort are **H / M / L**, grouped
into coherent workstreams rather than a ticket dump.

### NOW — "Stop the site from lying" (this month)

Almost all low/medium effort, almost all high impact — the cheapest,
highest-leverage quarter the site will ever have.

**Workstream 1 · Honest emergency data (the #1 finding)**

| Item | Why | Impact | Effort |
|---|---|:--:|:--:|
| Fix the reassuring failure state (2.1) | An error must read as degraded, never "all clear" | H | L |
| Wire the Warning Level cell (2.2) | The most important field is currently a literal string | H | L |
| Decouple the incident text list from Mapbox (2.3) | The weakest users get no data at all today | H | M |
| Add `aria-live="polite"` to the status strip | Screen-reader users hear nothing on escalation | H | L |
| Surface an "as-at HH:MM" timestamp + auto-refresh (~2–5 min) | No freshness signal; data is fetched once, ever | H | M |
| Persistent trust line: *"Local summary, may be delayed — official warnings at Hazards Near Me / call 000"* | Sets the correct expectation of authority | H | L |

**Workstream 2 · Safety-content corrections**

| Item | Why | Impact | Effort |
|---|---|:--:|:--:|
| Add the Neighbourhood Safer Place page (2.4) | No last-resort information exists anywhere | H | M |
| Info Line 1800 679 737 + ABC Radio 666AM on every page | Only fallback today is "check the app" | H | L |
| Per-level warning action text ("Watch and Act: prepare to leave") | A rating without meaning isn't actionable | H | L |

**Workstream 3 · Resilience foundations** *(a dependency for everything later)*

| Item | Why | Impact | Effort |
|---|---|:--:|:--:|
| Fold the fire proxies + contact validation into `api/shared/` | Caching must be written once, not copy-pasted in `server.js` | M | M |
| Free external uptime monitor → `/`, `/api/fire-danger`, a new `/api/health` | Zero "tell me when it's broken" exists today | H | L |

### NEXT — "Cache, then enrich" (this quarter)

**Workstream 4 · Last-known-good cache + the Free-tier bandwidth risk**

| Item | Why | Impact | Effort |
|---|---|:--:|:--:|
| Move to Static Web Apps **Standard** (~$9/mo) | Free tier's 100 GB cap can take the **whole site offline** mid-fire | H | L |
| Scheduled poller writes last-known-good; proxies serve from cache with `stale-while-revalidate` / `stale-if-error` | Stops upstream fan-out under load; degrades to "showing last known", not "No Rating" | H | M |
| Storage backup: point-in-time restore + soft-delete + daily export | A single point of total data loss today | M | L |
| Replace the Clarity `maybeRefreshClarity` race with the same cron | Non-atomic read-then-write can overshoot the daily budget | L | L |

*Depends on Workstream 3's shared-handler refactor — don't build the poller twice.*

**Workstream 5 · Local content — what rfs.nsw.gov.au cannot say**

| Item | Why | Impact | Effort |
|---|---|:--:|:--:|
| "Bungendore's bushfire risk & where to go" (local risk, mapped NSP, Kings Hwy fragility, leave-early) | Local narrative changes behaviour; leaflets don't | H | M |
| Rewrite Prepare around leaving early + trigger-setting + a real property checklist + rating→"what to do today" (fixes 2.5) | Current content omits the core survival message | H | M |
| "Animals in a bushfire" (horses & livestock) | This district is dense with horse properties | M | L |
| Permits & burning, plain-English explainer (BFDP dates, free permit, suspended from HIGH here, 24 hr notify, pile limits, TOBAN) | High local search intent; cuts escaped private burns | M | L |
| "About the brigade / our people" + non-firefighting roles + a real case-for-support on Donate | Trust, recruitment and funding in one page | M | L |
| Real event dates (kill every "Date TBC") + an "Other languages" block leading with TIS 131 450 | "TBC" reads as neglect; equity for non-English speakers | M | L |

**Workstream 6 · Accessibility to WCAG 2.2 AA** *(the DDA de-facto legal benchmark)*

| Item | Why | Impact | Effort |
|---|---|:--:|:--:|
| Mobile accordion headers → real `<button>` semantics (role / tabindex / aria-expanded) | Keyboard-unreachable content today | H | L |
| `dialog.showModal()` + focus trap/restore + Escape; real `<label>`s; announced inline errors | Contact form and dialogs fail AA | M | M |
| `prefers-reduced-motion` on the public site | No reduced-motion support exists at all | M | L |
| Plain-language pass on strip sub-labels (target Year 7–8, Australian Style Manual) | Jargon-heavy under stress | M | L |
| axe-core in CI + one manual screen-reader / keyboard pass; test at 400% zoom, reduced-motion, no-JS, Slow-4G with Mapbox blocked | No formal audit ever run; the "0 critical" claim is unverified | M | M |

**Workstream 7 · New external feeds** *(all drop into the existing proxy pattern — after the cache exists)*

| Item | Why | Impact | Effort |
|---|---|:--:|:--:|
| BOM Fire Weather Warning — "Southern Ranges" district (official FTP/RSS) | The real escalation trigger, currently absent | H | M |
| BOM live wind / temp / humidity + forecast (unofficial API, FTP fallback) | Wind is the missing fire-behaviour driver | H | M |
| TfNSW Live Traffic Hazards (free key, GeoJSON) | Kings Highway closures = "can I leave, which way" | H | L |
| Digital Earth Australia satellite hotspots (Himawari, 10-min) | Sees ignitions before they're formal incidents | M | M |
| BOM rain-radar loop (Captains Flat), cached image | Cheap, recognisable situational awareness | L | L |

*Feeds come after the cache — otherwise every new feed adds a new uncached failure
point on the free tier.*

### LATER — "Ambition, once the foundation holds"

| Item | Why | Impact | Effort |
|---|---|:--:|:--:|
| **PWA + service worker + offline last-known-good** | Works when the network doesn't — the fire scenario | H | H |
| **Admin "publish an alert banner to the public site"** | Lets the brigade say what the RFS feed can't | H | M |
| Personal relevance: location → nearest incident + distance + "what this means" | Was in the redesign spec, never built | H | H |
| NSW air quality (PM2.5 during smoke) | Thin local station coverage limits value | M | M |
| BOM flood + WaterNSW gauges (Turallo Creek floods the village) | A real but secondary local hazard | M | M |
| PII retention caps on enquiries + duty-phone history | Currently kept forever in plaintext | M | L |
| Test coverage: duty-claim PIN/`safeEqual`, session & rate-limit branches | Security-sensitive and untested | M | M |
| Resident email alert subscriptions (auto-triggered on escalation) | Multi-week build — see the bets | H | H |

---

## 4. The transformative bets

Four moves would make this genuinely best-in-class. Ordered by conviction. Each
rides on the foundations above — attempt them before the cache and the honest-data
work and they cost near-total rework.

### Bet 1 — "Fire Situation Right Now": one plain-English verdict

**Vision.** A single panel that fuses everything into one traffic-light sentence a
scared non-expert can act on: fire danger + Total Fire Ban + Danger Period
*(have)* + Fire Weather Warning + live wind + nearest-incident distance + satellite
heat within 30 km + Kings Highway status *(new)* →

> *"Conditions are dangerous. A fire is burning 12 km NW and the wind is pushing it
> toward town. If you plan to leave, leave now — the Kings Highway is open."*

**Why transformative here.** Every input already lands in the proxy pattern; the
synthesis is the moat. Official sites give data; **no one gives the verdict.** For
a community that must decide *whether and which way to leave* on one highway, the
verdict *is* the product.

**Honest cost.** Medium build, but it is the *composition* of Workstreams 1, 4 and
7 — near-free if those ship first, near-total rework if attempted before them.
Design it first, build it last. The risk is editorial, not technical: a wrong
verdict is worse than no verdict, so it must degrade gracefully and defer to
official warnings.

### Bet 2 — PWA + offline last-known-good

**Vision.** The resident who opened the site yesterday can open it during the fire
with no signal and still see the last-known rating, warning, incident list and NSP
location, clearly stamped "as at [time], you may be offline."

**Why transformative here.** Rural fire means network congestion or outage. A site
that dies with the network fails at its one job. Offline-capable emergency info is
the difference between a website and infrastructure.

**Honest cost.** High — service worker, cache strategy, careful staleness UX — but
it rides directly on the Workstream 4 cache. The one bet with a meaningful
maintenance tail (cache versioning discipline).

### Bet 3 — The admin-published alert banner

**Vision.** One admin control writes one content row that renders in the public
strip: *"Brigade update 2:40pm — crews are backburning off Bungendore Rd, expect
smoke and appliances, road remains open."*

**Why transformative here.** It converts the brigade from a *relay* of RFS data
into a *local voice*. Official feeds can't say the reassuring, specific, human
things residents actually want. Highest-value admin feature, and only medium effort
because the content plumbing already exists.

**Honest cost.** Medium build; the real cost is **governance** — who's authorised,
how it's worded, how it's taken down. Ship it with a discipline note, not just code.

### Bet 4 — Resident alert subscriptions (email first)

**Vision.** Residents opt in; on rating escalation past a threshold, the system
emails them automatically. Push beats pull in an emergency.

**Why transformative here.** The ceiling is high — but this is the one bet that can
wait. Email via the existing ACS setup is feasible and near-free.

**Honest cost.** High, multi-week. **SMS is a cost bomb (~$0.05/message) and a
false positive there erodes trust fast.** Do email only, throttled, high threshold,
and only after Bets 1–3.

---

## 5. What to deliberately NOT do

Scope discipline is a life-safety feature for a volunteer team: every hour on the
wrong thing is an hour off the failure modes above.

- **Don't self-translate content.** Multilingual copy will rot. Lead with
  TIS 131 450 and link the RFS's professionally translated resources. One block, done.
- **Don't build a roster, asset-check, or document store in the admin area.** These
  duplicate official RFS systems and Microsoft 365. Pure scope creep.
- **Don't scrape the licensed/commercial feeds** — power outages, lightning. Email
  RFS to confirm the hazard-reduction burn feed; otherwise skip.
- **Don't do SMS alerts.** Cost bomb plus trust risk. Email subscriptions only, and
  not this quarter.
- **Don't chase more data feeds before the cache exists.** Every uncached feed on
  the free tier is a new way to go offline. Fix the failure model, then enrich.
- **Don't add a framework or bundler.** The no-build constraint is a feature — it
  keeps the site maintainable by whoever inherits it. Nothing here needs it.
- **Don't trust the "Phase-7, 0 critical accessibility" claim.** It's contradicted
  by the accordion and dialog defects. Verify with axe-core + one manual pass.
- **Don't over-engineer the "Fire Situation" verdict into a scoring/ML engine.**
  It's a transparent rules table a human can audit. Keep it legible.

---

## 6. The one thing

**If the brigade does only one thing this month: make the emergency data honest —
fix the reassuring failure state, wire the hard-coded Warning Level cell, and
decouple the incident text list from the map bundle.**

It's one root cause (the data layer has no honest state model), it's small (mostly
L/M effort, the data already exists in `map.js`), and it removes the site's ability
to *quietly reassure a resident during a real fire* — the failure that three
independent reviewers found on their own. Everything else on this roadmap makes a
good site better. **This stops a good site from causing harm.**

---

**Sequencing rule for the whole quarter:**

> honesty (NOW) → durability (cache, NEXT) → richness (content + feeds, NEXT) →
> ambition (bets, LATER).

Never invert it — a richer site that fails unsafely is worse than a plain one that
tells the truth.

---

*Synthesis of five specialist reviews — external data, home-page UX, content &
community needs, backend resilience, accessibility & inclusion. All load-bearing
defect claims were verified against the codebase before writing. Verified anchors:
`public/index.html:205` (hard-coded `#stripWarningLevel`), `public/js/map.js:858`
and `:582` (incident list coupled to `map.on("load")` + `mapboxgl.LngLatBounds`),
`public/Content/prepareContent.md` (never says "leave early"). Note: the
`AFDRSMessages.json` permit-suspension-from-HIGH message is correct for the Southern
Ranges district and is not a defect.*
