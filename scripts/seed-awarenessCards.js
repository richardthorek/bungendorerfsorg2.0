#!/usr/bin/env node
/**
 * One-off: populate the "awarenessCards" content row with the real copy that
 * used to live in prepareContent.md / bushfireRiskContent.md /
 * neighbourhoodSaferPlaceContent.md / animalsInBushfireContent.md /
 * membershipContent.md / eventsContent.md — now admin-editable cards instead
 * of files that need a code change to update. Safe to re-run — it overwrites.
 *
 *   BRFS_STORAGE_CONNECTION=... node scripts/seed-awarenessCards.js
 */

require("dotenv").config();

const { validateContent } = require("../api/shared/contentSchema");
const { setContent, getContent } = require("../api/shared/store");

const CARDS = [
  // --- Prepare -----------------------------------------------------------
  {
    pillar: "prepare",
    icon: "fa-door-open",
    title: "Leaving Early Is the Safest Choice",
    body:
      "**The single most important decision in a bushfire is when to leave — and the safest time is always before the fire arrives.** " +
      'Homes and roads are most dangerous in the hours just before and during a fire front. Waiting to "see how bad it gets" is how people get caught. ' +
      "If you're not staying to actively defend a fire-ready property, plan to leave the night before or early on a bad-conditions day — not when you can already see smoke.",
  },
  {
    pillar: "prepare",
    icon: "fa-clock",
    title: "Set Your Trigger Now, Not on the Day",
    body:
      "Decide today what will make you leave, while you're calm and can think clearly — not in the middle of a fire when it's hardest to think straight. A trigger might be:\n\n" +
      "- The Fire Danger Rating for Southern Ranges reaches **Extreme** or **Catastrophic**.\n" +
      "- A **Watch and Act** or **Emergency Warning** is issued for our area.\n" +
      "- You see smoke, smell smoke strongly, or the sky turns orange/brown.\n" +
      "- The Kings Highway is your only way out and it's still open.\n\n" +
      "Write your trigger down and agree it with everyone in your household, including kids and anyone who needs extra time or help to leave.",
  },
  {
    pillar: "prepare",
    icon: "fa-clipboard-list",
    title: "What To Do, By Fire Danger Rating",
    body:
      "| Rating | What it means | What to do today |\n" +
      "| --- | --- | --- |\n" +
      "| Moderate | Most fires can be controlled. | Plan and prepare — check your property, refresh your bushfire survival plan. |\n" +
      "| High | Fires can be dangerous. | Be ready to act. Decide what you'll do if a fire starts nearby. |\n" +
      "| Extreme | Fires will spread quickly and be extremely dangerous. | Take action now. If your property isn't fire-ready to the highest level, go to a safer location well before a fire threatens. |\n" +
      "| Catastrophic | If a fire starts and takes hold, lives are likely to be lost. | **Leave bushfire risk areas.** Homes cannot withstand fires in these conditions — go early, in the morning or the night before. |\n\n" +
      "_(These match the official ratings and key messages published by the NSW RFS — see Fire Information above for today's rating.)_",
  },
  {
    pillar: "prepare",
    icon: "fa-check-circle",
    title: "A Property Checklist You Can Do This Weekend",
    body:
      "- Clear leaves and debris from gutters, decks and around the base of the house.\n" +
      "- Mow grass short and remove dead vegetation within a few metres of buildings.\n" +
      "- Move firewood piles, gas bottles and anything flammable away from the house.\n" +
      "- Check hoses reach all sides of the house and taps/pumps actually work.\n" +
      "- Know where your water, gas and power shutoffs are.\n" +
      "- Keep a battery radio, torch, first aid kit and copies of important documents ready to grab.",
  },
  {
    pillar: "prepare",
    icon: "fa-triangle-exclamation",
    title: "If You've Left It Too Late",
    body:
      "If a fire is threatening and you haven't left, sheltering at a **Neighbourhood Safer Place** is a last resort — not a plan. " +
      'See "Where To Go If You\'ve Left It Too Late" for our nearest one.',
  },
  {
    pillar: "prepare",
    icon: "fa-file-signature",
    title: "Make It Official",
    body: "A written plan beats a plan in your head. Use the [Bush Fire Survival Plan](https://www.myfireplan.com.au) tools, and revisit it each fire season.",
  },
  {
    pillar: "prepare",
    icon: "fa-map-marked-alt",
    title: "Bungendore's Bushfire Risk",
    body:
      "Bungendore sits in grassy, undulating country between forested ranges, in the NSW RFS **Southern Ranges** fire district. Grass and paddock fires can move fast on a hot, windy day, and long dry spells build up fuel in the bushland surrounding the village.\n\n" +
      "**The Kings Highway is our main route in and out of town, and often our only one.** On a bad fire day, it can also be the route a fire crosses or the route everyone else is trying to use to leave at the same time. Check [Live Traffic NSW](https://www.livetraffic.com/) for current road status before you travel on a high fire danger day.\n\n" +
      "The best protection is still the simplest: know your trigger to leave, have your property ready, and act on the Fire Danger Rating before the fire is visible.",
  },
  {
    pillar: "prepare",
    icon: "fa-campground",
    caution: true,
    title: "Where To Go If You've Left It Too Late",
    body:
      "**A Neighbourhood Safer Place (NSP) is a place of last resort — not a plan, and not a guarantee of safety.** It exists for the moment your bushfire survival plan has failed and you have nowhere else left to go. If you can leave early, always leave early instead.\n\n" +
      "**Our nearest Neighbourhood Safer Place is Mick Sherd Oval, Bungendore** — the main sporting oval, in the centre of town. [Open in Google Maps](https://www.google.com/maps/search/?api=1&query=Mick+Sherd+Oval+Bungendore+NSW).\n\n" +
      "Sheltering at an NSP does not guarantee your safety — it's a relatively cleared, open area away from the heaviest fuel loads, nothing more. Live outside Bungendore township, or want to check this is still current? See the [official NSW RFS Neighbourhood Safer Places list for Queanbeyan-Palerang LGA](https://www.rfs.nsw.gov.au/plan-and-prepare/neighbourhood-safer-places/lists/queanbeyan-palerang-lga).",
  },
  {
    pillar: "prepare",
    icon: "fa-paw",
    title: "Animals in a Bushfire",
    body:
      "This district has a lot of horse and livestock properties, and animals need their own plan — you can't always load them at the last minute.\n\n" +
      "- Decide now whether you will relocate animals early or leave them in a cleared paddock — floating horses out once a fire is close is often too dangerous and too slow.\n" +
      "- If relocating, arrange a safer property or agistment well outside the district before fire season, not on the day.\n" +
      "- If leaving animals on the property, choose the largest, most cleared paddock available, away from sheds and tree lines, and open gates between paddocks so they aren't trapped.\n" +
      "- Make sure animals are permanently identifiable (brand, microchip, tag).\n" +
      "- Keep a list of your animals, a recent photo of each, and your vet's contact details with your survival plan.\n\n" +
      "More detail: [NSW RFS — Animals and Pets in a Bush Fire Survival Plan](https://www.rfs.nsw.gov.au/plan-and-prepare/develop-a-bush-fire-survival-plan/animals-in-your-survival-plan).",
  },

  // --- Membership ----------------------------------------------------------
  {
    pillar: "membership",
    icon: "fa-user-plus",
    title: "Join the Bungendore RFS: Make a Difference!",
    body:
      "**Become part of an active and dedicated team.** Most months we train on the second Saturday morning and fourth Tuesday evening, plus specialised sessions through the year.\n\n" +
      "**Your journey to firefighter** can take up to 12 months, depending on course availability — we're with you every step of the way.\n\n" +
      "**Curious? Drop by and say hello** during our Friday evening maintenance, 7–8pm at the station — a low-key way to meet the crew before you apply.\n\n" +
      "[**Explore roles & apply for membership**](https://nswrfsprod.service-now.com/rfsembr?id=embr_rfs_role_explorer)",
  },
  {
    pillar: "membership",
    icon: "fa-handshake",
    title: "You Don't Have to Fight Fires to Join",
    body:
      "The brigade runs on more than just crews on trucks. Every one of these roles keeps us operating, and none require you to be on the fireground:\n\n" +
      "- **Community engagement & education** — school visits, community stalls, helping neighbours prepare.\n" +
      "- **Communications & radio** — running base radio, coordinating logistics during incidents.\n" +
      "- **Catering & logistics** — keeping crews fed, watered and equipped on long jobs.\n" +
      "- **Administration & secretary support** — the paperwork that keeps a volunteer brigade running.\n" +
      "- **Training support** — helping run the courses that get new members qualified.\n\n" +
      "If any of that sounds more like you than firefighting, say so when you drop by — there's a role that fits.",
  },
  {
    pillar: "membership",
    icon: "fa-home",
    title: "About the Brigade",
    body:
      "The Bungendore Rural Fire Brigade is a volunteer brigade of the NSW Rural Fire Service, part of the **Southern Ranges** fire district, serving Bungendore and the surrounding Queanbeyan-Palerang region. Like every RFS brigade, we're entirely volunteer-run — the people responding to your call-out live in this community.\n\n" +
      "**Support us without joining:** running trucks, training and equipment costs money beyond what's centrally funded. See the **Donate** link at the top of the page — every dollar stays with this brigade.",
  },

  // --- Events ----------------------------------------------------------------
  {
    pillar: "events",
    icon: "fa-bullhorn",
    title: "Brigade at Your Event? Let's Connect!",
    body: "Planning a community event? We'd love to be there if we can! Reach out via our **Contact Form** to discuss how the Bungendore RFS might participate.",
  },
  {
    pillar: "events",
    icon: "fa-image",
    photo: "/Images/communityEvent.jpeg",
    title: "Black Summer Fridge",
    body: "The brigade at the donation of the Black Summer Bungendore Fridge — a community thank-you for the 2019–20 season.",
  },
];

async function main() {
  if (!process.env.BRFS_STORAGE_CONNECTION) {
    console.error("BRFS_STORAGE_CONNECTION is not set.");
    process.exit(2);
  }

  const existing = await getContent("awarenessCards");
  if (existing && existing.items.length) {
    console.log(
      `awarenessCards: already has ${existing.items.length} items — skipping (delete the row to reseed).`
    );
    return;
  }

  const withOrder = CARDS.map((c, i) => ({ ...c, order: i }));
  const result = validateContent("awarenessCards", withOrder);
  if (!result.ok) {
    console.error(`awarenessCards: failed validation — ${result.error}`);
    process.exit(1);
  }
  await setContent("awarenessCards", result.items, "seed-awarenessCards.js");
  console.log(`awarenessCards: seeded ${result.items.length} cards`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
