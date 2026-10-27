# Growlance — Growth & Launch Playbook

Everything off-page that moves Growlance toward page 1. Technical SEO (structured
data, sitemap, keyword-aligned title/H1, prerendering) is already shipped — this
file is the human work that actually builds ranking authority.

Target keywords: **Freelancer.com AI bidding assistant**, **AI auto-bidder**,
**Freelancer auto bidding bot**, **AI proposal generator for Freelancer**.

---

## 0. Do this first — get indexed (≈20 min, highest ROI)

Nothing ranks until search engines know you exist.

- [ ] **Google Search Console** → add property `growlance.app` (DNS verification),
      then **Sitemaps → submit** `https://growlance.app/sitemap.xml`.
- [ ] **Bing Webmaster Tools** → add site, submit the same sitemap (you can import
      directly from GSC).
- [ ] In GSC, use **URL Inspection → Request indexing** on `https://growlance.app/`
      and `https://growlance.app/blog/` to jump the queue.
- [ ] Re-run the [Rich Results Test](https://search.google.com/test/rich-results)
      after each deploy to confirm Organization + SoftwareApplication stay valid.

---

## 1. Product Hunt launch kit

Launch on a **Tuesday–Thursday, 12:01am PT** (resets the daily leaderboard, max
exposure). Have 5–10 friends ready to genuinely comment (not just upvote — PH
weights comments). Don't ask for upvotes directly (against PH rules).

**Name:** Growlance

**Tagline (60 char max):**
> Your AI bidding co-pilot for Freelancer.com

Alternates:
> AI auto-bidder & proposal writer for Freelancer.com
> Win more Freelancer.com work, with way less busywork

**Topics/Tags:** Artificial Intelligence · Productivity · Freelance · SaaS
(use "Freelance", "Productivity", "Artificial Intelligence")

**Description (≈260 char):**
> Growlance is a local-first desktop app that finds the right Freelancer.com
> projects, drafts tailored AI proposals, and tracks every client — using your
> own API keys. No subscription, no cloud, no telemetry. Buy once, run forever.

**First comment (the maker's comment — post this immediately):**
> Hey Product Hunt 👋
>
> I built Growlance because bidding on Freelancer.com is a grind: refreshing the
> feed for hours, rewriting the same proposal, losing track of who replied.
>
> Growlance runs entirely on your own machine. It watches the feed, surfaces the
> projects that actually fit, drafts a tailored proposal you can review before it
> goes out, and keeps a built-in CRM of your clients and bids. It uses *your* own
> OpenAI and Freelancer API keys — so there's no vendor cloud, no telemetry, and
> nothing leaves your computer.
>
> A few deliberate choices:
> • **Local-first & private** — your data lives in a local DB, not our servers.
> • **One-time purchase** — no subscription. Your only ongoing cost is your own
>   OpenAI usage, at cost.
> • **Review-and-send** — you stay in control; a human approves every bid.
>
> It's macOS, Windows & Linux. Happy to answer anything about the AI proposal
> drafting, the privacy model, or responsible-use guardrails. What would make
> this a no-brainer for your workflow?

**Gallery checklist (PH ranks visual listings higher):**
- [ ] Thumbnail/logo (240×240, the manifest icon works)
- [ ] 3–5 product screenshots (reuse `public/screenshot-*.png`, 1270×760)
- [ ] A short demo GIF/video of the feed → draft proposal flow (huge for conversions)
- [ ] First image = a clean "hero" frame with the value prop in text

---

## 2. Directory & listing submissions (backlinks + discovery)

Each is a quality backlink **and** a discovery channel. Prioritize the top group.

**High-priority (do these):**
- [ ] **AlternativeTo** — list as an alternative to existing Freelancer/Upwork bid tools
- [ ] **SaaSHub** — software directory, decent DA
- [ ] **Indie Hackers** — post a "show IH" + product page
- [ ] **BetaList** (if you want a pre/early-launch push)
- [ ] **G2 / Capterra** — create the product listing (also where buyers compare tools)
- [ ] **Slant** — "best freelancing tools" lists

**Secondary:**
- [ ] **There's An AI For That** (theresanaiforthat.com) — high-traffic AI directory
- [ ] **Futurepedia / Futuretools** — AI tool directories
- [ ] **SaaSworthy**, **Crozdesk**, **GetApp**
- [ ] **Toolify.ai**, **AITool.report**, **AIcyclopedia**
- [ ] **StackShare** (list your tech stack — dev backlink)
- [ ] **Uneed**, **Fazier**, **MicroLaunch** (PH-style launch sites — recycle the PH copy)

**Communities (post value, not spam — link where genuinely relevant):**
- [ ] r/freelance, r/Upwork, r/digitalnomad (read rules; share as a maker, not an ad)
- [ ] Relevant Discord/Slack maker communities
- [ ] A Freelancer.com community/forum post if their ToS allows tool mentions

**Submission boilerplate (paste-ready):**
- *Name:* Growlance
- *One-liner:* AI bidding assistant & auto-bidder for Freelancer.com
- *Short desc:* Local-first desktop app that finds the right Freelancer.com
  projects, drafts AI proposals, and tracks clients with your own API keys.
  No subscription, no cloud, no telemetry.
- *Category:* AI / Productivity / Freelance tools
- *Pricing:* One-time $89 (crypto checkout)
- *Platforms:* macOS, Windows, Linux

---

## 3. Content engine (the durable, compounding play)

One landing page ranks for ~one keyword cluster. Articles capture long-tail
buyer-intent searches and build topical authority. The `/blog` is now live — keep
shipping posts. Ideas, ranked by buyer intent:

- [x] How to write Freelancer.com proposals that win *(shipped)*
- [x] How to find the right Freelancer.com projects faster *(shipped)*
- [x] Best Freelancer.com bidding tools in 2026 *(shipped)*
- [x] Is using an auto-bidder against Freelancer.com's rules? *(shipped)*
- [x] How many proposals should you send per day on Freelancer.com? *(shipped)*
- [x] Freelancer.com vs Upwork for new freelancers *(shipped)*
- [x] How to use AI to write proposals without sounding like a robot *(shipped)*
- [x] How to build a Freelancer.com profile that wins bids *(shipped)*
- [x] Fixed-price vs hourly on Freelancer.com: which to choose *(shipped)*
- [x] How to handle scope creep and difficult clients on Freelancer.com *(shipped)*
- [x] Freelancer.com fees explained: what you actually keep *(shipped)*
- [x] How to get your first job on Freelancer.com *(shipped)*
- [ ] Freelancer.com membership plans: which tier is worth it (next idea)
- [ ] How to spot and avoid Freelancer.com scams (next idea)

**Per-post SEO checklist** (the generator handles the technical bits):
- [ ] One clear target keyword in the title, first paragraph, and one H2
- [ ] 700–1500 words, genuinely useful (Google rewards dwell time)
- [ ] Internal link to the homepage and 1–2 other posts
- [ ] A natural CTA to Growlance at the end
- [ ] Add it to `content/blog/` — title/description/Article JSON-LD/sitemap are automatic

---

## 4. Ongoing / measure

- [ ] Check GSC **Performance** weekly: which queries show impressions? Write a post
      targeting any with impressions but low rank — that's proven demand.
- [ ] Once you have real customers, collect reviews → add `aggregateRating` to the
      SoftwareApplication schema for ⭐ star snippets (never fabricate ratings).
- [ ] Earn editorial backlinks: guest posts, "best tools" roundups, podcast mentions.
      Backlinks remain the #1 ranking lever for a young domain.
