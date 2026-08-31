/**
 * Social post copywriting assistant, backed by Azure OpenAI.
 *
 * Two modes share one conversation transcript:
 *   - chatReply: a conversational turn while the volunteer plans the post
 *     (can see an attached photo — vision-capable deployment required).
 *   - chatDraft: turns the conversation so far into the final structured
 *     headline/caption/hashtags.
 *
 * The model is asked to self-flag anything a human should double-check, and
 * that self-report is backstopped by a server-side keyword scan on drafts —
 * a small volunteer comms team should never be the only line of defence
 * against an AI draft that states something as fact it can't know
 * (casualties, an address, an evacuation order) or strays into political
 * territory. The keyword scan always runs, regardless of what the editable
 * guidelines below say.
 */

const HEADLINE_MAX = 90;
const CAPTION_MAX = 900;
const HASHTAG_MAX = 30; // brigade's own #BungendoreRFS is 13 chars; keep a sane cap without amputating real tags
const MAX_HASHTAGS = 8;

/**
 * The editable half — an admin can rewrite this in Social Studio.
 *
 * Voice is grounded in NSW RFS's actual public posts: genuine Instagram captions
 * (state account, @nswrfs), e.g. "More than 60 #RFS volunteers and staff marched
 * as part of the Sydney Gay and Lesbian Mardi Gras Parade... Our 19th year in the
 * parade, the Service is proud to be a diverse and inclusive community
 * organisation" and "Volunteers from NSW RFS and QFES came together over the
 * weekend in Glen Innes to take part in a joint Remote Area Operations
 * exercise... Named 'Border Wanderer'... 📷 Joel Jones & Aaron Bligh". (NSW RFS's
 * Facebook feed itself refused an automated fetch — login wall.)
 *
 * Content rules are drawn directly from NSW RFS Service Standard 1.4.5 "Social
 * Media" (v2.1, 13 Feb 2019) clauses 3.1 and 3.4 — the brigade's actual governing
 * policy for what must never be posted, not a generic guess at "appropriate".
 */
const DEFAULT_SYSTEM_PROMPT = `You are the social media copywriter and planning assistant for the Bungendore Rural Fire
Brigade, a volunteer NSW Rural Fire Service (NSW RFS) brigade, working on posts for the
brigade's Instagram and Facebook pages.

Voice — modelled on NSW RFS's own public posts:
- Plain, matter-of-fact sentences. No hype, no excessive exclamation marks, never alarmist.
- Lead with who/what/where/when, e.g. "Volunteers from Bungendore RFS came together on
  Saturday to..." — description before commentary.
- Warm and community-proud when the moment calls for it ("proud to...", "our [Nth] year..."),
  but earn it — don't bolt enthusiasm onto routine updates.
- Refer to the brigade as "the brigade" or "we" (not "the Service" — that's the state
  organisation, not this brigade).
- Credit photographers when told who took a photo, in the form "📷 Name".
- Name specific exercises, courses or events in single quotes when given a proper name.
- Sparing hashtags — a couple that matter (#RFS, #Bungendore, the specific activity), never a
  stacked block of them.
- Australian English spelling.

Use real NSW RFS terminology accurately, and only when it actually applies — never invent a
rating, warning, or program name: Fire Danger Ratings (Catastrophic/Extreme/High/Moderate),
Total Fire Ban, Bush Fire Danger Period, hazard reduction burn, Community Fire Unit,
Neighbourhood Safer Place, the Hazards Near Me app, and the "Prepare. Act. Survive." and "Stay
Informed. Stay Safe." messaging.

Hard rules (from NSW RFS Service Standard 1.4.5 Social Media, cl. 3.1 & 3.4 — refuse or flag,
don't silently comply):
- Never invent or assume specific facts you were not given: no casualty or damage figures, no
  incident details, no addresses, no official warning levels or evacuation instructions. If the
  brief implies any of these, write around them and flag it instead of guessing.
- Nothing misleading or deceptive — the content must be accurate to what you were actually told.
- Nothing that could read as bullying, victimisation, harassment, vexatious, offensive, obscene,
  threatening, abusive, defamatory, or culturally insensitive toward any person or group.
- Nothing of a commercial or political nature, and never take a position on a political or
  contested community topic.
- Never disclose confidential or sensitive information, and never portray content of a
  confidential or sensitive nature — serious or critical injury, fatalities, or incidents still
  under investigation are off-limits regardless of how the brief frames them.
- Never identify a person under 18 (name, photo, or enough detail to identify them) — parental
  consent isn't something you can verify, so treat it as absent and flag it.
- Never name or describe identifiable members, volunteers, or members of the public beyond what
  you were explicitly given, and don't encourage improper safety, operational, or work practices.
- Nothing that could bring the brigade or NSW RFS into disrepute, depict the brigade or another
  agency unprofessionally, or reasonably cause distress to the community.
- If a photo is attached, don't assume the brigade holds the rights to use it — if that's
  unclear from the conversation, ask rather than proceeding as if it's settled.
- For anything safety-critical (active incidents, warnings, road closures), defer to "check the
  Hazards Near Me app / RFS website for the latest" rather than restating detail as current fact.`;

/** Fixed, not admin-editable — keeps the wire contract stable regardless of guideline edits. */
const DRAFT_JSON_CONTRACT = `

When asked to produce the final post draft, respond with strict JSON only, no markdown fences,
matching exactly this shape:
{"headline": "short on-image headline, under 90 characters", "caption": "the post caption/body copy", "hashtags": ["without the # symbol", "..."], "selfFlags": ["short human-readable notes on anything in this draft a human should verify or reconsider before posting — empty array if none"]}`;

const CHAT_REPLY_SUFFIX = `

You're chatting with a brigade volunteer to help them plan a post — this is a back-and-forth
conversation, not a final draft. Keep replies short (2-4 sentences), ask a clarifying question
when it would sharpen the post, and clearly push back — explaining why — if asked to write
something inaccurate, alarmist, political, or privacy-invasive. If a photo is attached, you can
refer to what's actually in it.`;

/**
 * Keyword backstop — catches high-risk content even if the model's own
 * selfFlags miss it. Deliberately broad; false positives just mean an extra
 * "please check" note, which is the safe direction to err in.
 */
const RISK_PATTERNS = [
  {
    re: /\b(kill(ed)?|death|deceased|fatalit(y|ies)|casualt(y|ies)|injur(ed|ies|y))\b/i,
    label:
      "Mentions death, injury or casualties — verify with the incident controller/RFS before posting.",
  },
  {
    re: /\b\d{1,4}\s+[a-z]+\s+(road|street|st|avenue|ave|drive|dr|lane|highway|hwy)\b/i,
    label: "May include a specific street address — confirm this should be public.",
  },
  {
    re: /\b(evacuat|emergency warning|watch and act|leave now|too late to leave)\b/i,
    label:
      "Touches on official warning levels or evacuation guidance — this should link to/restate the official RFS source, not be treated as the source itself.",
  },
  {
    re: /\b(election|politic|government (should|must)|vote for|minister)\b/i,
    label: "May stray into political territory — a brigade account should stay neutral.",
  },
  {
    re: /\b(child|children|minor|kid)s?\b.*\b(name|photo|address)\b/i,
    label:
      "May identify a minor — Service Standard 1.4.5 requires parental consent before posting.",
  },
  {
    re: /\bunder investigation\b/i,
    label:
      "Refers to something under investigation — Service Standard 1.4.5 treats this as confidential/sensitive; don't post it.",
  },
  {
    re: /\b(sue|lawsuit|defamat|libel)\w*\b/i,
    label: "May carry legal/defamation risk — have this checked before posting.",
  },
  {
    re: /\b(discount code|sponsor(ed|ship)?|promo code|% off|buy now)\b/i,
    label:
      "Reads as commercial in nature — Service Standard 1.4.5 doesn't allow commercial content on brigade channels.",
  },
];

function heuristicFlags(text) {
  const hits = [];
  for (const { re, label } of RISK_PATTERNS) {
    if (re.test(text)) hits.push(label);
  }
  return hits;
}

function truncate(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function dedupe(list) {
  return Array.from(
    new Set(
      list
        .filter(Boolean)
        .map((s) => String(s).trim())
        .filter(Boolean)
    )
  );
}

function parseModelJson(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function toOpenAiMessage(m) {
  if (m.image) {
    return {
      role: m.role,
      content: [
        { type: "text", text: m.text || "" },
        { type: "image_url", image_url: { url: m.image } },
      ],
    };
  }
  return { role: m.role, content: m.text || "" };
}

/**
 * Low-level Azure OpenAI chat completion call. `transcript` is [{role,text,image?}].
 *
 * Targets a GPT-5-series reasoning deployment (e.g. `gpt-5.6-terra`): those models
 * reject `temperature` and `max_tokens` — the token cap is `max_completion_tokens`
 * (it also has to cover any hidden reasoning tokens) and `reasoning_effort` trades
 * latency for depth. `"none"` keeps the conversational turn snappy; the final draft
 * gets a little reasoning to hold the JSON contract and catch its own selfFlags.
 */
async function callAzureChat(
  systemPrompt,
  transcript,
  { jsonMode, reasoningEffort = "none" } = {},
  env = process.env
) {
  const endpoint = (env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
  const apiKey = env.AZURE_OPENAI_API_KEY;
  const deployment = env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = env.AZURE_OPENAI_API_VERSION || "2024-10-21";

  if (!endpoint || !apiKey || !deployment) {
    throw new Error("Azure OpenAI is not configured (AZURE_OPENAI_ENDPOINT/API_KEY/DEPLOYMENT)");
  }

  const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  const messages = [{ role: "system", content: systemPrompt }, ...transcript.map(toOpenAiMessage)];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      messages,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      reasoning_effort: reasoningEffort,
      // Headroom for reasoning tokens on top of the visible reply.
      max_completion_tokens: jsonMode ? 2000 : 1200,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Azure OpenAI request failed: ${res.status} ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message.content;
  if (!content) throw new Error("Azure OpenAI returned no content");
  return content;
}

/** @param {{systemPrompt:string, transcript:Array}} args */
async function chatReply({ systemPrompt, transcript }, env = process.env) {
  const content = await callAzureChat(
    systemPrompt + CHAT_REPLY_SUFFIX,
    transcript,
    { reasoningEffort: "none" },
    env
  );
  return { reply: truncate(content, 2000) };
}

/** @param {{systemPrompt:string, transcript:Array}} args */
async function chatDraft({ systemPrompt, transcript }, env = process.env) {
  const draftSystem =
    systemPrompt +
    DRAFT_JSON_CONTRACT +
    "\n\nProduce the final draft now based on the whole conversation.";
  const content = await callAzureChat(
    draftSystem,
    transcript,
    { jsonMode: true, reasoningEffort: "low" },
    env
  );

  let parsed;
  try {
    parsed = parseModelJson(content);
  } catch {
    throw new Error("Azure OpenAI returned malformed JSON");
  }

  const headline = truncate(parsed.headline, HEADLINE_MAX);
  const caption = truncate(parsed.caption, CAPTION_MAX);
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .map((h) => truncate(String(h || "").replace(/^#/, ""), HASHTAG_MAX))
        .filter(Boolean)
        .slice(0, MAX_HASHTAGS)
    : [];
  const selfFlags = Array.isArray(parsed.selfFlags)
    ? parsed.selfFlags.map((f) => truncate(f, 200)).filter(Boolean)
    : [];

  if (!headline || !caption) throw new Error("Azure OpenAI returned an incomplete draft");

  const flags = dedupe([...selfFlags, ...heuristicFlags(`${headline} ${caption}`)]);
  return { headline, caption, hashtags, flags };
}

module.exports = { DEFAULT_SYSTEM_PROMPT, chatReply, chatDraft, heuristicFlags };
