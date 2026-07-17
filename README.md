# AID Story Helper / Manager

This extension provides character tracking, Plot Essentials updates, MemorAID NPC thought generation, per-NPC memory recollections, Crystallized long-term memory, a Living Characters social simulation, proper noun suggestions, full local backup/restore, mobile settings sync, and local campaign archiving for AI Dungeon. It runs on Firefox and Chromium-based browsers, on both desktop and mobile.

**Bring your own provider.** Every AI generation runs through a single generation seam that calls *your* configured model provider — Anthropic Claude, OpenAI, Google Gemini, or a local Ollama model — using your own API key, directly from your browser.

---

## ✨ What's New in v1.2

v1.2 is a deep rework of how the extension models characters and their memory. Everything below generates through **your own provider**.

- **Core Character cards — compass, not script.** In-depth characters are now generated from their *interior* — values, dispositions, self-view, wants, the formative "why" — a compass the AI improvises behavior from, instead of prescriptive trait labels (which the game over-indexed into caricature: "pragmatic" → a Vulcan) or a fixed enumerated script. Cards are leaner, generated in a **single pass**, and evolve only when the story shows a durable **drift** rather than re-rolling the whole personality every time a character leaves the scene. Two explicit tiers: **Core Character** (deep, evolving, gets Thoughts + Crystallized) and **Side Character** (a lean behavioral shell).
- **Phenotype-grounded appearance.** A character's build and look is sampled once from a local, population-plausible parametric model (seeded from card + story cues), persisted, and fed as grounding into the generation call — so descriptions stay coherent across regenerations instead of drifting. Precise measurements and quirks are assembled deterministically; a **re-roll** control resamples just the body ("same person, new dice") without disturbing who they are.
- **Crystallized long-term memory — reworked and scene-aware.** Each tracked character grows a distilled, evolving memory and self-model across four layers: **Knows** (facts + feelings about others), **Vivid Memories** (episodic snapshots with a vibrancy/decay lifecycle), **Outlook** (generalized beliefs that decay toward the self), and **Preferences** (concrete personal texture). The working state lives in the extension's own database instead of being round-tripped through an AID card; a repeated moment **reinforces** one memory rather than minting a duplicate; and a **never-met gate** stops the model inventing relationships between characters who never shared a scene. Each turn the card re-renders around **who is in the current scene** — lightweight NLP scores each stored item against the scene text, so scene-relevant **Knows** and **Preferences** come first and a **Recalls** block is drawn from that character's Per-NPC Memory Bank (below) for the people present (threshold-gated, so nothing surfaces when nothing is relevant). But because each block still fills to its cap, some off-scene texture stays "always around" — a stray Preference, a relationship not in the room — so the card reads as a whole person rather than a purely reactive echo of the current scene. All four distillation layers are produced in a single provider call, each individually toggleable.
- **Per-NPC Memory Bank.** A deep, queryable well of NPC point-of-view recollections distilled from AI Dungeon's own memory blocks (bounded, not per-action). Retrieval is pure local NLP (entity/keyword overlap, relevance-thresholded), surfacing a small **Recalls** block for the characters present — and nothing when nothing is relevant.
- **MemorAID thought continuity.** NPC thoughts are now a rolling window of recent thoughts (minimum 1) kept in the card and fed back as context, so a character's inner monologue evolves turn to turn instead of resetting each turn; the per-turn entry is a two-bullet **Intake/Thought** with an offstage marker when the character isn't in the scene.
- **Living Characters social simulation.** A pure-NLP background simulation (no AI calls) that seeds, advances, and retires relationship "pressures" between characters — including off-screen **Life Events** so the social world keeps moving while you're elsewhere — and appends a subtle directive to your action so a pressure surfaces naturally in the narrative. You can author **pairing pressure pools** to control which pressures are allowed between which characters. Adapted **with explicit permission** from the [LivingCharacters](https://github.com/LivingNarratives/LivingCharacters) project by **LivingNarratives** (aka nerdgrl450) — MIT; see [Credits](#-credits).
- **Sharper scene NLP.** A single authoritative **in-scene presence** repository — derived from genuine narrative text (the extension's own injected directives stripped out first) and shared by every subsystem — so off-scene characters can't be mis-seeded or mis-tracked. Proper-noun detection gained structural **evidence gates + a pending pool**: a candidate must recur across distinct mentions before it's ever suggested, cutting false positives dramatically (a real 2,457-action story dropped from 368 noisy suggestions to 179).

---

## 🛠️ Build and Installation Instructions

This extension is built for Firefox and Chromium-based browsers (Manifest V3). Follow these instructions to compile and package the extension from its source files.

### Requirements
- **Operating System:** Platform-agnostic (Windows 10/11, macOS, or Linux).
- **Tooling:** Node.js (v18.0.0 or higher) and npm (v9.0.0 or higher) must be installed.

### Step-by-Step Build Steps
1. Extract the source files into a clean directory.
2. Open a terminal / PowerShell in that directory.
3. Install package dependencies:
   ```bash
   npm install
   ```
4. Execute the build pipeline:
   ```bash
   npm run build
   ```
   This compiles the TypeScript files and copies `manifest.json` + asset HTML files to the `dist/` directory.

### Loading the Extension in Browser
- **Firefox:** Navigate to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and select the [manifest.json](file:///c:/Users/x509x/Documents/Claude/dist/manifest.json) file in the `dist/` directory.
- **Chrome / Edge / Opera:** Navigate to `chrome://extensions/`, enable **Developer mode** (top right toggle), click **Load unpacked**, and select the `dist/` folder.

---

## 🌟 Core Features

### 1. Card Manager (Roster & Proposals)
- Tracks default AI Dungeon card types (`character`, `class`, `race`, `location`, `faction`, `custom`) and lists every tracked card in one roster.
- **Character generation — "compass, not script" (reworked in v1.2):** each character card carries two roster buttons that generate through your configured provider:
  - **⚡ Generate Core Character** — an in-depth, evolving card built from the character's *interior* (values, dispositions, self-view, wants, the formative "why") instead of prescriptive trait labels like "pragmatic" (which the game over-indexes into a caricature) or a fixed enumerated script the character then robotically follows. Leaner than the old multi-pass cards, and produced in a single provider call.
  - **✨ Generate Side Character** — a shorter behavioral shell for background characters: memorable, usable details without the high-resolution interior.
  - Proposals land as highlighted pending edits with diffs — review, edit, accept, or reject; nothing is written to AI Dungeon until you approve.
- **Drift-gated evolution (opt-in):** the background monitor tracks who is active in the scene (a character who leaves, or who has been active for $N$ turns — default 20 — is a candidate). With **Auto-Update Character Cards** on (Settings → General, **off by default**), a Core Character is re-proposed only when the story shows a durable **drift** in who they are — not on every scene change — so the card evolves rather than thrashing on the same evidence. With it off, you drive updates yourself with the buttons above.

### 2. Plot Essentials (PE) Management
- **What it is:** Plot Essentials is AI Dungeon's always-in-context memory — the bracketed `[Name is …]` character bios and key facts the AI sees every turn. The extension reads and maintains these blocks for you.
- **On-demand updates:** Click **Update Plot Essentials** to have your configured AI provider (Claude, OpenAI GPT, Gemini, or Ollama) analyze recent actions and propose revised bios for your tracked characters. Proposals appear as highlighted pending changes you can review, edit, accept, or reject — nothing reaches AI Dungeon until you approve it.
- **Reliable apply:** Approving a change pushes it to AI Dungeon's Plot Essentials and keeps the on-page editor in sync, guarding against AI Dungeon's autosave silently reverting your edit — so updates stick without a page reload.
- **Plot Essentials "Memories" log (optional):** A `[Memories (newest to oldest): …]` block kept *inside* Plot Essentials — a curated, always-in-context running history, separate from AI Dungeon's native Memory Bank. Enable **Use Memories in Plot Essentials** (Settings → MemorAID) and seed the block once in this exact format:
  ```
  [Memories (newest to oldest):
  - latest memory here
  - something that happened before that
  ]
  ```
  Each **Update Plot Essentials** run then summarizes new events into one-sentence entries and prepends them to the top of the list, keeping a continuous story log. A longer **Analyze Lookback Actions** window (60+) is recommended so the AI has enough context to write high-quality, continuous memories.
- **Customizable:** Tune the Plot Essentials prompt sections in the **Prompts** tab.

### 3. MemorAID NPC Thought Tracking
- Intercepts outgoing player turns (actions, dialogue, retries, continues) to generate subjective thoughts, feelings, and impulses for the NPCs actually present in the scene, so their reactions stay consistent with what just happened.
- **Per-turn thought format (redesigned in v1.2):** each turn writes a two-bullet entry — **Intake** (the flat observation the NPC registers) and **Thought** (their unresolved inner reaction, no tidy resolution) — into the character's companion `(Memory)` card. When the character isn't in the scene, an **offstage** marker is recorded instead of a fabricated thought, so absent NPCs don't invent reactions to events they weren't part of.
- **Rolling "Inner Self" window:** each `(Memory)` card keeps a configurable window of recent thoughts (newest-first, **minimum 1** — set it in Settings → MemorAID → *Thought Lookback*), and those same prior thoughts are fed back as context, so a character's inner monologue evolves turn to turn instead of resetting. Entry length is bounded by *Thought Card Limit*.
- **Where it runs:** thoughts generate *before* the turn is sent (you'll briefly see a "Character is reflecting…" placeholder); if your provider is slow (e.g. local Ollama), raise **Action Intercept Timeout** (Settings → MemorAID) so the turn waits long enough. The `(Memory)` cards live in the **Card Manager** roster, not the Memory Bank tab.

### 4. Memory Bank Management
- Lists individual memory blocks generated by AI Dungeon's timeline engine.
- Provides a yellow lightning bolt icon (⚡) on each memory block to manually trigger refinement/summarization.
- Support for auto-regeneration: can automatically summarize the latest memory block on each turn using loop-safe diffing to prevent endless saving cycles.

### 5. Proper Noun Auto-Detection & Alias Linking
- Scans recent turns using NLP to detect candidate location or character names that aren't yet tracked as cards.
- **Evidence-gated suggestions (hardened in v1.2):** a candidate waits in a per-adventure **pending pool** and is only surfaced once it clears structural gates — seen across **≥2 distinct action mentions** (and, for single words, appearing mid-sentence with a capital) — instead of on first sight. Demonym, discourse-marker, and loanword filters, contraction/elision rejection, and junk-edge trimming ("Luckily Vegas" → "Vegas") keep the pool clean. On a real 2,457-action story this cut noise roughly in half (368 → 179 suggestions) while keeping the names that mattered.
- Qualifying names appear as **suggestion banners above the Card Manager roster** — one click classifies and creates the Story Card.
- **Alias linking:** attach a nickname/alias (e.g. "Pookie" → character Steve) directly to an existing card, merging it into that card's trigger keys so future mentions resolve to the right character.
- **Manage them:** review, reclassify, link, or delete detected nouns anytime under **Settings → Debug → Proper Noun Logs**.

### 6. OffMeta's AIN Repository
- Fetches and parses a community library of AI Instruction (AIN) rule-sets from **OffMetaGamer's** public repository.
- Browse the available rule-sets in-panel and apply any of them to your adventure's AI Instructions with a single click.

### 7. Adventures Manager (Global Bucket & DB Explorer)
- Browse every adventure cached in the extension's local database, drilling into each one's AI Instructions, Author's Notes, Plot Essentials character bios, and Story Cards.
- Maintain a reusable **Global Bucket** of favorited assets (AI Instructions, Author's Notes, PE character bios, and Story Cards) that can be imported into any active adventure via GraphQL — handy for carrying setups across campaigns.
- Hide, restore, or fully delete cached adventures from local storage.

### 8. Full Database Backup & Restore
- Export your entire local database — settings, story cards, version history, adventures, and Memory Bank entries — to a single JSON file, and restore it later. **API keys are never included** in the backup, so it's safe to store or share.
- If the extension detects an empty local database (e.g. after a browser/profile change or a reinstall that resets storage), a one-click **self-heal banner** offers to restore from a backup.

### 9. Mobile Settings Sync (QR Code) & Responsive UI
- Generate a **QR code** on desktop to carry your settings (prompts, templates, lookback windows, limits — **never API keys**) to a phone: scan it with the phone's camera and the settings import automatically.
- The sidebar is fully responsive — it docks to a full-width panel on mobile (≤600px) with touch dragging, and remembers your position, size, and minimized state on desktop.

### 10. NPC Memory Bank (Per-Character Recollections)
- **What it is (new in v1.2):** a deep, local, queryable well of **per-NPC, point-of-view recollections** — what each tracked character personally remembers of events, in their own voice — distilled from AI Dungeon's own timeline memory blocks (bounded by the game's block count, *not* by raw action count). It's the source behind the scene-aware **Recalls** line that appears in a character's Crystallized card.
- **Requires Crystallized.** The memory bank is owned by the Crystallized system, so it only builds for characters while **Enable Crystallized Memory** is on (Settings → MemorAID) and the character is tracked. It has its own on/off toggle (see §11) if you want Crystallized without per-NPC recollections.
- **How it fills:** one recollection per (native memory block × present NPC), generated **forward-automatically** as new blocks form, bounded to a single block at a time so there's no context bleed and quiet characters don't accumulate memories they weren't around for. For existing history, open a character's drawer under the **Memory Bank tab → NPC sub-pane** and click **Backfill memories** to walk the back-catalog newest-first (throttled, never automatic).
- **Cheap by design:** when a memory block is (re)generated, the player-facing summary **and** every present NPC's recollection come out of a *single* provider call, not one call per character. Retrieval at read time is pure NLP (entity/keyword overlap against the current scene, relevance-thresholded) — no extra AI calls to surface Recalls, and nothing surfaces when nothing is relevant.

### 11. Crystallized Long-Term Memory
- **What it is (new in v1.2):** an evolving, distilled long-term memory and self-model kept per tracked character — a card that grows into who they've become over a long story, in four layers:
  - **Knows** — facts *and* current feelings about the other people/places/things they care about.
  - **Vivid Memories** — episodic snapshots with a vibrancy lifecycle; a repeated moment **reinforces** one memory instead of minting a duplicate, and unreinforced ones fade.
  - **Outlook** — generalized, first-person beliefs about themselves and the world that decay over time.
  - **Preferences** — concrete personal texture (tastes, habits, quirks) that refines but never decays.
- **Enable it:** Settings → MemorAID → **Enable Crystallized Memory (Long-Term)**. It's a **global toggle, off by default** — turn it on once and it applies across all adventures; per-adventure fields only override the layer caps, never the master switch.
- **Distillation:** every *K* turns (the *Crystallized Distillation Interval*, default 20), a character present in that window is distilled. All four layers are produced in a **single provider call**, and each layer has its own **on/off toggle** — plus one for the per-NPC memory recollections (§10) — so you can trim cost layer by layer (turn one off and it just drops from the call). Manual controls live on each Crystallized card: **Distill now** (catch up immediately), **Consolidate** (compress the schema), and **Consolidate Outlook** (fold settled beliefs into the durable character card, then clear them so they re-accumulate).
- **Scene-aware rendering:** each turn the card re-renders around **who is in the current scene** — lightweight NLP scores stored items against the scene text, so scene-relevant **Knows** and **Preferences** come first and a **Recalls** block is pulled from the character's Per-NPC Memory Bank (§10) for the people present (threshold-gated). Because each block still fills to its cap, some off-scene texture stays "always around" (a stray Preference, a relationship not in the room), so the card reads as a whole person rather than a pure echo of the scene. The card is only re-saved when the present cast changes, keeping write churn low.
- **Guardrails:** a **never-met gate** stops the model inventing relationships between characters who never shared a scene, and nothing is ever hard-deleted — decayed/cleared items are archived. Per-layer **render caps** (Knows/Vivid/Outlook/Preferences, plus the NPC memory-bank size) are configurable in the same settings area.

### 12. Living Characters (Social Simulation)
- A **pure NLP/script** background simulation — **zero LLM calls** — that seeds and retires relationship "Life Cards" between characters, with pressures, momentum, dormancy, staleness, and lifetime-cap lifecycles.
- **On by default** (safe out-of-the-box since it makes no API calls), but dormant until you configure it per adventure.
- **Setup & activation:** open **⚙️ Simulation Configuration** in the sidebar, set your roster and pressure pool, then click **💾 Save Simulation Config**. Saving is required **once per adventure after you open it** — an unsaved adventure never starts the simulation, even with everything else configured.
- **Pressure pool & the 🎭 Pressures & Presets Library:** the *Active Pressures Pool* is the general set every relationship can draw from. Click an individual **Core Pressure** (or Wildcard) pill to add that **one** pressure to the pool; click a **Preset Mode** to apply that **whole category** of pressures at once. Re-save the config afterward to keep the change.
- **Specific pairings (this fork's addition):** give a named couple their own comma-delimited pressure list, and when those two are paired the pressure is drawn **only** from that list (symmetric — either direction). Each of them still forms general-pool pressures toward every *other* Living-Characters-enabled character; the exclusive list applies to that pair alone. This targeted-pairing capability is the reason the engine is forked from the original.
- **Prompt injection (why you'll see brackets):** a browser extension can't reach AI Dungeon's hidden AI context, so when a pressure seeds, the extension appends a short bracketed directive to your action — e.g. `[Alice now feels rivalry toward Bob (momentum: low); let this surface naturally.]` — so the story model weaves it in. That bracket in your action text is expected, not a bug. On a Continue/retry (which carries no player text to append to), the directive is held and rides your next typed action instead.
- **Adapted with explicit permission from the [LivingCharacters](https://github.com/LivingNarratives/LivingCharacters) project by LivingNarratives** (aka nerdgrl450 in the AI Dungeon Discord), and used under the MIT license (see [Credits](#-credits)).

### 13. Phenotype-Grounded Character Generation
- **What it is (new in v1.2):** when you **⚡ Generate Core Character**, the **Appearance** isn't invented from scratch each time — the extension first samples a **population-plausible body/appearance profile** locally (build, height, features), then feeds those anchors into the generation call as grounding. The result is a coherent look that doesn't drift between regenerations, with precise measurements and physical quirks assembled deterministically rather than hallucinated.
- **How the body is decided:** gender is resolved in layers — an explicit card field first, then story cues (pronouns / honorifics / a gendered name), else body sampling is skipped (non-human / ungendered) and only a story-based description is written. Cues are read once via NLP from the card plus recent story mentions of the character. The sampled body is **persisted**, so regenerating a character reuses the same physique instead of redrawing it.
- **🎲 Re-roll Body:** unhappy with a draw (say an unlikely height)? The **Re-roll Body** button on the card re-samples a *different* body and rewrites only the physical description (**Appearance + Scent**), carrying the personality/voice/drive verbatim — "same person, new dice." It's crucially re-derived from the character's original captured cues, not the now-polluted card text, so it won't just land on the same outlier again. It arrives as a reviewable pending proposal; rejecting it restores the prior profile.

---

## 🧭 Using the Extension Sidebar (Menu Guide)

Once loaded in the page, the extension overlays a sidebar on AI Dungeon, with the following areas:

### 🗃️ Card Manager
- **Roster & Active Location:** Select your current location manually or view all tracked story cards in the campaign.
- **Pending Proposals:** View highlighted changes to character profiles or story cards. Accept, Reject, or Edit them in-place.
- **Proper Noun Banners:** Review newly detected proper nouns and click to immediately create matching story cards.

### ⚡ Memory Bank
- Displays AI Dungeon's discrete chronological timeline memory blocks.
- Click **Regenerate memory block** (⚡) next to any block to run a refined summary of the corresponding actions using your outside AI provider.
- *Note:* NPC thought logs are **not** here — MemorAID writes them to their own Thought-typed `(Memory)` Story Cards, which appear in the **Card Manager**.

### ⚙️ Settings
Settings is split into seven tabs:
- **General Tab:** Theme; **Protagonist Name** (resolves the `{protagonist}` placeholder in instructions); **Auto-Regen Memory Bank** (auto-refine the latest Memory Bank entry); **Action Lookback Window** (how many recent actions analysis considers, default 20); **Character Card Limit** (cap generated character/story-card entry length, default 600); **Auto-Update Character Cards** (auto-propose character profile updates as they drift; **off by default** — leave it off to trigger updates manually); **Active Location Sync Mode**; and **Enable Proper Noun Detection**.
- **AI Provider Tab:** Choose your model provider (Anthropic Claude, OpenAI, Google Gemini, or local Ollama), enter the matching API key, and pick a model from the searchable list.
- **MemorAID Tab:** **Use Memories in Plot Essentials** toggle; the lookback windows (default 8 turns for scene context, 5 for presence tracking); **MemorAID Thought Lookback** (how many recent thoughts to keep as a rolling window in each NPC's `(Memory)` card and feed back as context for continuity; minimum 1); **Thought Card Limit** (cap thought-card entry length, default 2000); and **Action Intercept Timeout** (how long the game waits for NPC thoughts before advancing the turn — raise it for slow local providers like Ollama).
- **Prompts Tab:** Customize the character generation templates (Appearance, Quirks, Dynamic relationship pacing, etc.), the per-card-type Story Card commands, and the Plot Essentials prompt sections.
- **OffMeta's AIN Tab:** Browse and one-click apply community AI Instruction rule-sets from OffMetaGamer's repository.
- **Adventures Manager Tab:** Browse the local adventure database, maintain a Global Bucket of reusable assets (AI Instructions, Author's Notes, PE bios, Story Cards), and import them into the active adventure.
- **Debug Tab:**
  - **Learned Operations:** the captured AI Dungeon GraphQL mutation templates (enabling offline fetch relays).
  - **Proper Noun Logs:** editor to classify, delete, or link aliases directly to existing cards.
  - **Full Database Backup & Restore:** save your whole local database to a JSON file (API keys excluded) and restore it on any device.
  - **Mobile Settings Sync (QR Code):** generate a QR code to transfer your settings to a phone by scanning.
  - **Diagnostics:** toggle verbose console logging, or log *only* the raw Update Plot Essentials AI request/response to the browser Console.
  - **Database Tools:** Backfill history, Export campaign to JSON, or Clear Local DB.

---

## 🙏 Credits

- **Living Characters** — the relationship / social-simulation engine (Life Cards, relationship pressures, momentum, and the surrounding lifecycle) is adapted **with explicit permission** from the [**LivingCharacters**](https://github.com/LivingNarratives/LivingCharacters) project by **LivingNarratives** (aka **nerdgrl450** in the AI Dungeon Discord), and used under the terms of its MIT license:

  > Copyright (c) 2026 LivingNarratives — MIT License

  Sincere thanks to LivingNarratives / nerdgrl450 for granting permission and for the original design and reference implementation, without which this feature wouldn't exist. The full MIT notice is preserved in the source header of [`src/inference/living-characters.ts`](src/inference/living-characters.ts).

- **Crystallized long-term memory** — the long-term memory feature that became Crystallized was suggested by **waras** in the AI Dungeon Discord.

- **Adventures Manager (Local DB Explorer) & Favorites (Global Bucket)** — suggested by **Vargaskall Volkrand** in the AI Dungeon Discord.
