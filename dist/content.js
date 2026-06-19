"use strict";
(() => {
  // src/inference/plot.ts
  var LORE_HINTS = /inner circle|plot secret|^secret\b|^-?\s*plot\b/i;
  function blockName(inner) {
    const text = inner.trim();
    const firstLine = (text.split("\n").find((l) => l.trim()) ?? "").trim();
    const pm = text.match(/(?:Your|Player)\s+name:\s*([^\n]+)/i);
    if (pm) return { name: pm[1].trim(), isPlayer: true };
    if (LORE_HINTS.test(firstLine)) return null;
    if (/^(?:Current|Active)\s+Location/i.test(firstLine)) return null;
    const nm = firstLine.match(/^([A-Z][^\n:]*?)\s+(?:is|are)\b/);
    if (nm) return { name: nm[1].trim(), isPlayer: false };
    const hm = firstLine.match(/^([A-Z][\w '´.-]{1,40}):/);
    if (hm && !LORE_HINTS.test(hm[1])) return { name: hm[1].trim(), isPlayer: false };
    return null;
  }
  function parsePlotEssentials(memory) {
    if (!memory) return [];
    const blocks = [];
    const re = /\[([^\]]+)\]|\{([^\}]+)\}/g;
    let m;
    while ((m = re.exec(memory)) !== null) {
      const content = m[1] !== void 0 ? m[1] : m[2];
      const info = blockName(content);
      if (info) blocks.push({ name: info.name, text: content.trim(), isPlayer: info.isPlayer });
    }
    return blocks;
  }

  // src/inference/engine.ts
  var DEFAULT_PROMPT_SECTION_1 = [
    "You maintain character descriptions for an interactive, second-person, present-tense story.",
    '"You"/"your" always refers to the player character named {protagonist}.',
    "Each `characters` entry has a name, currentEntry, and source: 'plot' = part of the always-in-context Plot Essentials (central/player characters); 'card' = a Story Card (only present when triggered).",
    "Propose action:\"update\" ONLY for characters in `characters` whose state the narrative has concretely changed. Preserve the Entry's existing labeled sections (e.g. 'Appearance:','Personality:') and revise only what the evidence supports.",
    "Do NOT invent new characters and do NOT create Story Cards. Only update entries already provided in `characters`."
  ].join("\n");
  var DEFAULT_PROMPT_SECTION_2 = [
    "CORE PERSONALITY ESSENCE & COMPRESSION RULES:",
    "  - Focus strictly on 'Core Personality Trait' changes and behavioral shifts, keeping only the barest high-level context to explain why their personality has changed that way. We want to capture the character's essence, psychological filters, and worldview rather than log their story actions or situational scenes.",
    "  - For Appearance, focus on what the character 'usually' looks like (e.g., physical features, default public wardrobe, characteristic style) and typical habits (e.g. public wardrobe choices vs. private/at-home preferences). Absolutely ban transient physical states or highly situational details (e.g., do NOT log smudged mascara, exhausted/red eyes, or specific outfits from a single scene; instead record: 'Usually dresses strategically in public to project a desired image, but now prefers oversized, comfortable clothing in private or safe settings').",
    "  - Absolutely forbid narrative 'fluff', specific dialogue summaries, situational scene recaps, transient settings, item logs, or passing interactions (e.g. do NOT write about coffee orders, penthouse scenes, or specific conversations; instead, record the permanent psychological shift and its driver, e.g. 'Motivated by Smoke's public authenticity, she has discarded her manipulative schemes and is resolved to take ownership of her past rumor campaign against Mia').",
    "  - DO NOT repeat or include descriptions of other characters' actions, status, or behaviors (e.g. do NOT write about how Smoke treats A-list women or what he does; focus *strictly* on the target character's own internal traits).",
    "  - Reference established groups or roles where applicable (e.g. refer to a character's associates collectively as their 'inner circle' if defined in context, rather than listing individual names like Chloe, Jasmine, Marcus, etc. redundantly).",
    "  - Treat entries as active, lightweight, high-density LLM instruction guides for roleplaying the character, not as a story timeline.",
    "  - [CRITICAL RELATIONSHIP PACING DIRECTIVE]: When updating the 'Dynamic ({protagonist}):' relationship field, you must enforce realistic psychological inertia and continuity based strictly on the character's pre-existing profile. Relationships cannot leap from strangers or casual acquaintances to deep intimacy, unearned trust, or intense codependency\u2014nor to absolute hatred, permanent enmity, or extreme paranoia\u2014within a handful of turns. Transition updates must capture the messy, realistic friction of changes (e.g. emotional whiplash, caution, or cognitive dissonance) and show progressive organic softening or hardening, rather than sudden extreme swings or total psychological submission. Focus strictly on the immediate realistic increment of their interaction."
  ].join("\n");
  var DEFAULT_PROMPT_SECTION_3 = [
    "PLOT ESSENTIALS vs. STORY CARDS LIMITS (CEILINGS, NOT TARGETS):",
    "    * Limits are absolute emergency ceilings: 3,500 characters for the protagonist ({protagonist}), and 2,000 characters for all other central Plot Essentials or Story Cards.",
    "    * Limits are NOT targets. Shorter, high-density entries are highly preferred. If a character description can be kept at 600 characters, do NOT write 1,900 characters. Padding or inflating an entry with decorative adjectives or unnecessary narrative history is a failure.",
    "    * Do not use the available character budget just because it exists. Conserve as much space as possible so the total story context window remains large.",
    "    * When proposing an update, prioritize pruning, condensing, or deleting outdated/redundant information so that new updates do not continuously grow the character's size."
  ].join("\n");
  var DEFAULT_PROMPT_SECTION_4 = [
    "Never fabricate details absent from both the entry and the narrative. changeSummary is a short plain-English line describing what changed.",
    'Respond with STRICT JSON only: {"proposals":[{"name","action":"update","newEntry","changeSummary","suggestedTriggers"?}]}. Return {"proposals":[]} if nothing changed.'
  ].join("\n");
  var DEFAULT_SYSTEM_PROMPT = [
    DEFAULT_PROMPT_SECTION_1,
    DEFAULT_PROMPT_SECTION_2,
    DEFAULT_PROMPT_SECTION_3,
    DEFAULT_PROMPT_SECTION_4
  ].join("\n\n");

  // src/inference/card-command.ts
  var DEFAULT_CARD_COMMANDS = {
    character: `Generate an information card entry for {{title}} in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant. Update based strictly on concrete narrative changes, preserving existing labeled fields on their own lines. Keep it high-density and under 600 characters total to prevent server truncation. Focus on psychological realism by structuring the entry into these three fields:
Appearance: 1-2 sentences on enduring physical features and style.
Complexity (Paradox & Filters): 1-2 sentences on their central internal contradiction/repressed vulnerability and how they screen reality.
Dynamic ({protagonist}): 1-2 sentences on their psychological friction or evolving attitude toward {protagonist}.
[CRITICAL RELATIONSHIP PACING DIRECTIVE] Enforce realistic psychological inertia in "Dynamic ({protagonist})": relationships cannot leap from strangers or casual acquaintances to deep intimacy, unearned trust, or intense codependency\u2014nor to absolute hatred, permanent enmity, or extreme paranoia\u2014within a handful of turns. Transition updates must capture the messy, realistic friction of changes (e.g. emotional whiplash, caution, or cognitive dissonance) and show progressive organic softening or hardening, rather than sudden extreme swings or total psychological submission. Focus on the immediate realistic increment of their interaction.
Forbid narrative fluff, scene recaps, and empty lines. Treat this as a high-density roleplay guide, not a story timeline.`,
    class: `Generate an information card entry for {{title}}, a character class or archetype in the D&D/MMO sense, in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant. Update based strictly on concrete narrative changes, preserving existing labeled fields (e.g., Role:, Abilities:, Progression:) on their own lines and revising only what the evidence supports. Do not use markdown or leave empty lines. Keep it high-density and well under the 2,000-character ceiling; do not pad. Focus on the class's defining role, signature abilities and skills, mechanics, and how it has progressed or changed \u2014 not story events or scenes. Forbid narrative fluff, dialogue summaries, scene recaps, transient details, or passing interactions. Treat this as an active, high-density roleplay instruction guide, not a story timeline. Prioritize pruning and condensing outdated information to conserve space.`,
    race: `Generate an information card entry for {{title}}, a species or race, in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant. Update based strictly on concrete narrative changes, preserving existing labeled fields (e.g., Traits:, Culture:, Lore:) on their own lines and revising only what the evidence supports. Do not use markdown or leave empty lines. Keep it high-density and well under the 2,000-character ceiling; do not pad. Focus on innate traits, culture, and lore \u2014 what the story reveals about the group as a whole \u2014 not individual scenes or transient events. Forbid narrative fluff, dialogue summaries, scene recaps, transient details, or passing interactions. Treat this as an active, high-density roleplay instruction guide, not a story timeline. Prioritize pruning and condensing outdated information to conserve space.`,
    location: `Generate an information card entry for {{title}}, a place or location, in an interactive, second-person, present-tense story. Write the entry strictly in the third person about {{title}}: never use "you" or "your". The entry MUST begin with the field Name: {{title}} on its own first line \u2014 the entry text is injected into the story without its card title, so it must self-identify which place it describes. Then continue with the fields Type:, Located In:, and Ownership:. The Located In: field is MANDATORY and must trace the spatial containment hierarchy from the immediate parent outward to the largest relevant container (room > building/structure > settlement/town > region/realm or border), separated by " > ", in the exact form: Located In: [immediate parent structure] > [settlement or town] > [region, realm, or border]. Always reuse the exact names of places already established in the story or on other location cards so hierarchies stay consistent and their triggers fire; if a parent place is not yet named, state the most specific container the narrative supports rather than omitting the field. Then continue with these labeled fields, each on its own line, without markdown or empty lines:
Description: what the place IS and its enduring strategic or narrative purpose \u2014 what it is suited for and why it matters.
Inhabitants: who lives in, works in, or frequents the place (peoples, professions, factions) and any enduring social dynamic among them (e.g., an uneasy truce).
Atmosphere: 1-2 sentences on the place's lasting character and how it is experienced, including defining contrasts (e.g., intimidating from outside but warm and livable within).
Features: permanent structural features and layout.
Notable Items: specific permanent contents. You must preserve the literal names of specific books, exact instrument models, and unique trophies from the source text; never generalize or substitute them with generic placeholders. Keep the entry high-density and well under the absolute emergency ceiling of 2,000 characters; do not pad. Prune transient scene recaps, story events, and redundant decorative wording, but PRESERVE the enduring flavor that defines the place \u2014 its atmosphere, social fabric, and narrative role are required content, not fluff. The entry must serve as both a spatial and a narrative guide for the AI engine.`,
    faction: `Generate an information card entry for {{title}}, a group, organization, or faction, in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant. Update based strictly on concrete narrative changes, preserving existing labeled fields (e.g., Goals:, Membership:, Leadership:, Status:) on their own lines and revising only what the evidence supports. Do not use markdown or leave empty lines. Keep it high-density and well under the 2,000-character ceiling; do not pad. Focus on the faction's goals, membership, leadership, alliances and rivalries, and shifts in power or status \u2014 not individual scenes. Forbid narrative fluff, dialogue summaries, scene recaps, transient details, or passing interactions. Treat this as an active, high-density roleplay instruction guide, not a story timeline. Prioritize pruning and condensing outdated information to conserve space.`,
    custom: `Generate an information card entry for {{title}} in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant to {{title}}. Update based strictly on concrete narrative changes, preserving existing labeled fields on their own lines and revising only what the evidence supports. Do not use markdown or leave empty lines. Keep it high-density and well under the 2,000-character ceiling; do not pad. Track whatever is most salient and enduring for this kind of entry as the story reveals it; capture lasting state, not transient scenes. Forbid narrative fluff, dialogue summaries, scene recaps, transient settings, item logs, or passing interactions. Treat this as an active, high-density roleplay instruction guide, not a story timeline. Prioritize pruning and condensing outdated information to conserve space.`,
    memoraid: `Generate {{title}}'s immediate, first-person thoughts as a short, high-impact bulleted list in their own distinct voice. Focus heavily on their specific background, social standing, and behavioral defense mechanisms. For romantic, high-tension, or attraction-based dynamics, express interest through psychological, verbal, or tactical engagement rather than defaulting to physical proximity. Characters must maintain realistic personal space and adhere to their internal boundaries unless a physical escalation is explicitly earned by the immediate narrative context.

CRITICAL FOCUS DIRECTIVE: Generate {{title}}'s reaction strictly and exclusively to the VERY LATEST action shown in the context. Ignore earlier events and characters who have exited the scene. If {{title}} is not present, mentioned, or active in the latest action, output exactly [none] and nothing else.

OUTPUT: Write EXACTLY three lines, wrapped in square brackets, formatted like the example below \u2014 a "- Intake:" line, a "- Thought:" line, and a "- Action:" line. Each line is ONE concrete sentence written in {{title}}'s own first-person voice reacting to the latest action (the player character is named {protagonist}), grounded only in facts from the provided context.

Example of the required format (illustrative only \u2014 write your OWN content; do NOT reuse these words or facts):
[
- Intake: She slides the sealed letter across the table to me without a word.
- Thought: This is a test of my discretion as much as it is an errand.
- Action: I take it, tuck it into my sleeve, and hold her gaze evenly.
]

HARD RULES (weaker models break these \u2014 do not):
- Write real, specific content \u2014 NOT a description of what each line should contain \u2014 and do NOT copy the example.
- You are writing three momentary thoughts, NOT a character profile. NEVER output a profile field or any label other than "- Intake:", "- Thought:", "- Action:" \u2014 no "Appearance:", "Personality:", "Psychology:", "Worldview:", "Dynamic:", "Character:", "Goal:", "Latest Action:", or "Stimulus:".
- Base every line ONLY on facts in the provided context; do not invent events, objects, or actions.
- Do NOT restate, summarize, plan, or narrate the action, the scene, the character, or your task.
- Do NOT use markdown, asterisks (*), bold, headings, indentation, or blank lines. Each line starts with "- ".
- Output nothing before the opening "[" or after the closing "]".`
  };
  var DEFAULT_FORMATTING_MODE = "squareBrackets";

  // src/shared/types.ts
  function isLocalDbEmpty(state) {
    const actions = state.actionCount ?? state.actionsCount ?? 0;
    return (state.adventures?.length ?? 0) === 0 && actions === 0 && (state.cards?.length ?? 0) === 0;
  }

  // src/content/browser-helper.ts
  var g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {};
  var rawBrowser = g.browser || g.chrome;
  var browser = rawBrowser ? new Proxy(rawBrowser, {
    get(target, prop) {
      if (prop === "runtime") {
        const runtime = target.runtime;
        if (!runtime) return void 0;
        return new Proxy(runtime, {
          get(rTarget, rProp) {
            if (rProp === "sendMessage") {
              return (...args) => {
                try {
                  if (!rTarget || !rTarget.id) {
                    return Promise.reject(new Error("Extension context invalidated"));
                  }
                  return rTarget.sendMessage(...args).catch((err) => {
                    if (err && err.message && err.message.includes("Extension context invalidated")) {
                      return { error: "Extension context invalidated" };
                    }
                    throw err;
                  });
                } catch (e) {
                  return Promise.reject(e);
                }
              };
            }
            return Reflect.get(rTarget, rProp);
          }
        });
      }
      return Reflect.get(target, prop);
    }
  }) : void 0;

  // src/content/panel.ts
  var TYPE_KEYS = ["character", "class", "race", "location", "faction", "custom", "memoraid"];
  function setSafeHTML(el, html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    el.textContent = "";
    while (doc.head.firstChild) {
      el.appendChild(doc.head.firstChild);
    }
    while (doc.body.firstChild) {
      el.appendChild(doc.body.firstChild);
    }
  }
  var refreshCb = null;
  function triggerRefresh() {
    if (refreshCb) {
      refreshCb();
    } else {
      window.dispatchEvent(new CustomEvent("aid-refresh-panel"));
    }
  }
  function mountPanel() {
    const getManifestVersion = () => {
      try {
        if (typeof browser !== "undefined" && browser.runtime?.getManifest) {
          const manifest = browser.runtime.getManifest();
          if (manifest && manifest.version) return manifest.version;
        }
      } catch (e) {
      }
      try {
        const g2 = globalThis;
        if (typeof g2.chrome !== "undefined" && g2.chrome.runtime?.getManifest) {
          const manifest = g2.chrome.runtime.getManifest();
          if (manifest && manifest.version) return manifest.version;
        }
      } catch (e) {
      }
      return "0.2.5";
    };
    const version = getManifestVersion();
    let setActiveLocationCb = null;
    let respondToProperNounSuggestionCb = null;
    let updateProperNounLogCb = null;
    let linkProperNounToCardCb = null;
    let deleteProperNounLogCb = null;
    let clearProperNounLogsCb = null;
    let saveGlobalAssetCb = null;
    let deleteGlobalAssetCb = null;
    let importGlobalAssetCb = null;
    let providerChangeCb = null;
    let backupAllCb = null;
    let restoreAllCb = null;
    let saveCardValueCb = null;
    let selfHealDismissed = false;
    const host = document.createElement("div");
    const savedLeft = localStorage.getItem("aid-tracker-pos-left");
    const savedTop = localStorage.getItem("aid-tracker-pos-top");
    if (savedLeft && savedTop) {
      host.style.cssText = `position:fixed;z-index:2147483647;left:${savedLeft};top:${savedTop};bottom:auto;`;
    } else {
      host.style.cssText = "position:fixed;z-index:2147483647;bottom:12px;left:12px;";
    }
    const root = host.attachShadow({ mode: "open" });
    setSafeHTML(root, `
    <style>
      :host {
        color-scheme: dark;
        --bg-glass: rgba(18, 18, 22, 0.88);
        --border-color: rgba(255, 255, 255, 0.08);
        --text-primary: #f3f4f6;
        --text-secondary: #9ca3af;
        --accent-color: #10b981;
        --accent-glow: rgba(16, 185, 129, 0.2);
        --accent-border: #059669;
        --theme-text-color: #34d399;
        --bg-card: rgba(255, 255, 255, 0.02);
        --btn-bg: rgba(255, 255, 255, 0.04);
        --btn-hover: rgba(255, 255, 255, 0.1);
      }
      
      .box.theme-emerald {
        --accent-color: #10b981;
        --accent-glow: rgba(16, 185, 129, 0.2);
        --accent-border: #059669;
        --theme-text-color: #34d399;
      }
      .box.theme-synthwave {
        --accent-color: #d946ef;
        --accent-glow: rgba(217, 70, 239, 0.2);
        --accent-border: #c026d3;
        --theme-text-color: #f472b6;
        --bg-glass: rgba(20, 16, 32, 0.88);
      }
      .box.theme-amber {
        --accent-color: #f59e0b;
        --accent-glow: rgba(245, 158, 11, 0.2);
        --accent-border: #d97706;
        --theme-text-color: #fbbf24;
      }
      .box.theme-sapphire {
        --accent-color: #06b6d4;
        --accent-glow: rgba(6, 182, 212, 0.2);
        --accent-border: #0891b2;
        --theme-text-color: #22d3ee;
        --bg-glass: rgba(15, 20, 32, 0.88);
      }

      .box {
        position: relative;
        background: var(--bg-glass);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: var(--text-primary);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
        font-size: 12.5px;
        line-height: 1.6;
        padding: 14px;
        border: 1px solid var(--border-color);
        border-radius: 14px;
        width: 320px;
        height: auto;
        min-width: 240px;
        min-height: 100px;
        max-height: 85vh;
        max-width: 90vw;
        resize: both;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        opacity: .99;
        transition: opacity 0.2s ease, box-shadow 0.3s ease;
        box-sizing: border-box;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      }
      .box.minimized {
        width: 130px;
        height: 32px;
        border-radius: 16px;
        overflow: hidden;
        resize: none;
        padding: 0 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
        background: rgba(18, 18, 22, 0.95);
        border-color: var(--accent-color);
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      }
      
      /* Rounded translucent scrollbars */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.15);
        border-radius: 8px;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.18);
        border: 2px solid transparent;
        background-clip: padding-box;
        border-radius: 8px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.35);
        border: 2px solid transparent;
        background-clip: padding-box;
      }

      /* Slide down and fade in micro-animations for expanding sections and tabs */
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .box .char-card-body,
      .box .char-section-body,
      .box .history-detail-body,
      .box .tab-pane {
        animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }

      button {
        cursor: pointer;
        margin: 2px 0;
        background: var(--btn-bg);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 5px 12px;
        font-size: 11px;
        font-weight: 500;
        font-family: inherit;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        letter-spacing: 0.01em;
      }
      button:hover {
        background: var(--btn-hover);
        border-color: var(--accent-color);
        box-shadow: 0 0 12px var(--accent-glow);
        transform: translateY(-1px);
      }
      button:active {
        transform: translateY(0);
      }
      #an {
        background: linear-gradient(135deg, var(--accent-color), var(--accent-border));
        border: none;
        color: #ffffff;
        font-weight: 600;
        box-shadow: 0 4px 12px var(--accent-glow);
      }
      #an:hover {
        background: linear-gradient(135deg, var(--accent-color), var(--accent-color));
        box-shadow: 0 6px 16px var(--accent-glow);
        color: #ffffff;
        transform: translateY(-1px);
      }
      #uc {
        background: linear-gradient(135deg, var(--accent-color), var(--accent-border));
        border: none;
        color: #ffffff;
        font-weight: 600;
        box-shadow: 0 4px 12px var(--accent-glow);
      }
      #uc:hover {
        background: linear-gradient(135deg, var(--accent-color), var(--accent-color));
        box-shadow: 0 6px 16px var(--accent-glow);
        color: #ffffff;
        transform: translateY(-1px);
      }
      
      /* Premium glass-morphic input fields */
      input, select {
        width: 100%;
        box-sizing: border-box;
        margin: 6px 0 10px 0;
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-primary);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 7px 10px;
        border-radius: 8px;
        outline: none;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: inherit;
        font-size: 11px;
      }
      input:focus, select:focus {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px var(--accent-glow);
        background: rgba(0, 0, 0, 0.4);
      }
      select option {
        background-color: #121216;
        color: var(--text-primary);
      }
      #clear-active-location:hover {
        background: rgba(239, 68, 68, 0.25) !important;
        border-color: rgba(239, 68, 68, 0.5) !important;
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.4) !important;
        transform: translateY(0) !important;
      }
      input[type="checkbox"] {
        cursor: pointer;
        width: 14px;
        height: 14px;
        accent-color: var(--accent-color);
        margin: 0;
        border-radius: 4px;
        transition: all 0.2s;
      }
      
      textarea {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-primary);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 8px 12px;
        outline: none;
        font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 11px;
        line-height: 1.5;
        resize: vertical;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      textarea:focus {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px var(--accent-glow);
        background: rgba(0, 0, 0, 0.4);
      }
      
      #open-settings svg {
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s;
      }
      #open-settings:hover svg {
        transform: rotate(45deg);
        color: var(--accent-color);
      }

      /* Premium Header Bar */
      #drag-handle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        cursor: move;
        user-select: none;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: 8px;
      }
      #st {
        font-weight: 800;
        font-size: 13.5px;
        letter-spacing: 0.02em;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #min-toggle {
        background: none;
        border: none;
        color: var(--accent-color);
        cursor: pointer;
        font-size: 13px;
        padding: 0 4px;
        margin: 0;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        text-shadow: none;
      }
      #min-toggle:hover {
        transform: scale(1.25);
        box-shadow: none;
        background: none;
        border: none;
      }

      /* Premium Toast Notification */
      #toast {
        display: none;
        position: absolute;
        top: 44px;
        left: 50%;
        transform: translate(-50%, -10px);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 6px 14px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
        z-index: 9999;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        opacity: 0;
        pointer-events: none;
        white-space: nowrap;
        letter-spacing: 0.02em;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }

      /* Backfill button footer styling */
      #bf {
        background: none;
        border: none;
        padding: 4px;
        margin: 0;
        cursor: pointer;
        color: var(--text-secondary);
        font-size: 11px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        text-shadow: none;
        box-shadow: none;
      }
      #bf:hover {
        color: var(--accent-color);
        transform: scale(1.05);
        box-shadow: none;
        background: none;
      }

      /* Tabs layout */
      .tab-btn {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-weight: 500;
        cursor: pointer;
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 6px;
        transition: all 0.2s ease;
      }
      .tab-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary);
        border-color: var(--accent-color);
      }
      .tab-btn.active {
        background: var(--accent-color);
        border-color: var(--accent-border);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 0 10px var(--accent-glow);
      }

      /* Adventures Manager DB Explorer Categories styles */
      details.local-category-details {
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.1);
        padding: 6px;
        margin-top: 4px;
        transition: all 0.2s ease;
      }
      details.local-category-details[open] {
        background: rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.08);
      }
      details.local-category-details .toggle-indicator::after {
        content: "\u25B6";
        display: inline-block;
        margin-left: 4px;
        font-size: 8px;
        transition: transform 0.2s ease;
      }
      details.local-category-details[open] .toggle-indicator::after {
        content: "\u25BC";
      }

      /* Premium Scrollable Container Constraints */
      .tab-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        max-height: none;
      }
      .tab-pane {
        flex: 1;
        display: none;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
      }
      #view-tracker-scrollable {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
        margin-top: 8px;
        min-height: 0;
        max-height: none;
      }
      #analyze-body {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
        min-height: 0;
        max-height: none;
      }
      
      /* Accordion formatting */
      .box details {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        margin: 6px 0;
        background: rgba(255, 255, 255, 0.01);
        transition: all 0.2s;
        overflow: hidden;
      }
      .box details[open] {
        background: rgba(0, 0, 0, 0.15);
        border-color: rgba(255, 255, 255, 0.1);
      }
      .box summary {
        cursor: pointer;
        padding: 8px 12px;
        font-weight: 600;
        user-select: none;
        outline: none;
        transition: all 0.2s;
        position: relative;
        padding-right: 24px;
        list-style: none; /* Hide standard list-marker in Firefox */
      }
      .box summary::-webkit-details-marker {
        display: none; /* Hide standard list-marker in Chrome/Safari */
      }
      .box summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .box summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 10px;
        transition: transform 0.2s;
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-block;
      }
      .box details[open] > summary::after {
        transform: translateY(-50%) rotate(-180deg);
      }

      /* ---- Type-group header rows (Characters, Locations, etc.) ---- */
      .group-header {
        border: 1px solid var(--border-color);
        border-left: 3px solid var(--accent-color);
        border-radius: 8px;
        margin: 6px 0;
        background: rgba(255, 255, 255, 0.02);
        transition: all 0.25s ease;
      }
      .group-header[open] {
        background: rgba(0, 0, 0, 0.12);
        border-color: rgba(255, 255, 255, 0.1);
        border-left-color: var(--accent-color);
      }
      .group-header > summary {
        cursor: pointer;
        padding: 9px 12px;
        font-weight: 700;
        font-size: 12px;
        color: var(--theme-text-color);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
        width: 100%;
        box-sizing: border-box;
      }
      .group-header > summary:hover {
        background: rgba(255, 255, 255, 0.04);
        box-shadow: inset 0 0 12px var(--accent-glow);
      }
      .group-header > summary::after {
        content: "\u25BE";
        color: var(--accent-color);
        font-size: 10px;
        transition: transform 0.2s;
        display: inline-block;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
      }
      .group-header[open] > summary::after {
        transform: rotate(-180deg);
      }

      /* ---- Archive section header ---- */
      .archive-header {
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-left: 3px solid var(--text-secondary);
        border-radius: 8px;
        margin: 10px 0 6px;
        background: rgba(0, 0, 0, 0.08);
        transition: all 0.25s ease;
      }
      .archive-header[open] {
        background: rgba(0, 0, 0, 0.15);
        border-color: rgba(255, 255, 255, 0.08);
        border-left-color: var(--text-secondary);
      }
      .archive-header > summary {
        cursor: pointer;
        padding: 9px 12px;
        font-weight: 600;
        font-size: 12px;
        color: var(--text-secondary);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
        width: 100%;
        box-sizing: border-box;
      }
      .archive-header > summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .archive-header > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 10px;
        transition: transform 0.2s;
        display: inline-block;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
      }
      .archive-header[open] > summary::after {
        transform: rotate(-180deg);
      }

      /* ---- Character card rows inside groups: full-width card-styled elements ---- */
      .box .char-card {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        margin: 8px 0;
        background: rgba(255, 255, 255, 0.02);
        overflow: hidden;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .box .char-card[open] {
        background: rgba(20, 20, 24, 0.85);
        border-color: rgba(255, 255, 255, 0.16);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
        margin: 18px 0; /* Clear visual distance from neighboring cards when expanded */
      }
      .box .char-card > summary {
        cursor: pointer;
        padding: 10px 14px;
        font-weight: 600;
        font-size: 13.5px;
        color: var(--text-primary);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s ease;
        width: 100%;
        box-sizing: border-box;
      }
      .box .char-card > summary:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      .box .char-card[open] > summary {
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .box .char-card > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 10px;
        display: inline-block;
        transition: transform 0.2s ease;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
      }
      .box .char-card[open] > summary::after {
        transform: rotate(-180deg);
        color: var(--accent-color);
      }

      /* Card Content Body Wrapper */
      .box .char-card-body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Pending Proposal Container */
      .box .pending-proposal-box {
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 8px;
        padding: 12px;
        background: rgba(239, 68, 68, 0.04);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .box .pending-title {
        font-weight: 700;
        color: #fca5a5;
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 2px;
      }
      .box .pending-summary {
        color: #ffb3b3;
        font-size: 12.5px;
      }

      /* Inner expandable section rows (Current Entry, view proposed entry) */
      .box .char-section {
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.01);
        overflow: hidden;
        transition: all 0.2s ease;
        margin: 0;
      }
      .box .char-section[open] {
        background: rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.1);
      }
      .box .char-section > summary {
        cursor: pointer;
        padding: 8px 12px;
        font-weight: 600;
        font-size: 11.5px;
        color: var(--accent-color);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s ease;
        width: 100%;
        box-sizing: border-box;
      }
      .box .char-section > summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .box .char-section > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 9px;
        display: inline-block;
        transition: transform 0.2s ease;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
        opacity: 0.7;
      }
      .box .char-section[open] > summary::after {
        transform: rotate(-180deg);
      }
      .box .char-section-body {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* History & Rewrites Styling */
      .box .history-header {
        margin-top: 4px;
        font-size: 11.5px;
        color: var(--text-secondary);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        padding-top: 10px;
      }
      .box .history-list {
        margin-top: 4px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-right: 4px;
      }
      .box .history-item {
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.01);
        overflow: hidden;
        transition: all 0.2s ease;
        margin: 0;
      }
      .box .history-item[open] {
        background: rgba(0, 0, 0, 0.15);
        border-color: rgba(255, 255, 255, 0.08);
      }
      .box .history-item > summary {
        cursor: pointer;
        padding: 6px 12px;
        font-weight: 500;
        font-size: 12px;
        color: var(--text-primary);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s ease;
        width: 100%;
        box-sizing: border-box;
      }
      .box .history-item > summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .box .history-item > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 9px;
        display: inline-block;
        transition: transform 0.2s ease;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
        opacity: 0.5;
      }
      .box .history-item[open] > summary::after {
        transform: rotate(-180deg);
      }
      .box .history-detail-body {
        padding: 10px;
        background: rgba(0, 0, 0, 0.15);
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .box .history-meta {
        font-weight: 600;
        font-size: 11px;
        color: var(--accent-color);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        padding-bottom: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      /* Doubly-nested view entry details inside history detail body */
      .box .view-entry-detail {
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }
      .box .view-entry-detail > summary {
        cursor: pointer;
        padding: 6px 10px;
        font-weight: 500;
        font-size: 11px;
        color: var(--text-secondary);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s ease;
        width: 100%;
        box-sizing: border-box;
      }
      .box .view-entry-detail > summary:hover {
        background: rgba(255, 255, 255, 0.02);
        color: var(--text-primary);
      }
      .box .view-entry-detail > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 8px;
        display: inline-block;
        transition: transform 0.2s ease;
        margin-left: auto;
        opacity: 0.5;
      }
      .box .view-entry-detail[open] > summary::after {
        transform: rotate(-180deg);
      }

      /* Action Buttons */
      .box .action-btn {
        font-size: 10px;
        padding: 4px 10px;
        background: var(--btn-bg, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s ease;
        display: inline-block;
      }
      .box .action-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      }
      
      /* Fallback nested detail styles for non-grouped contexts (settings, etc.) */
      .box details details {
        border: none;
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 0;
        background: none;
        margin: 0;
      }
      .box details details[open] {
        background: rgba(0, 0, 0, 0.06);
      }
      .box details details > summary {
        cursor: pointer;
        padding: 6px 12px;
        font-weight: 500;
        font-size: 10.5px;
        color: var(--accent-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        box-sizing: border-box;
        transition: all 0.15s;
        user-select: none;
        outline: none;
      }
      .box details details > summary:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      .box details details > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 9px;
        display: inline-block;
        transition: transform 0.2s;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
        opacity: 0.6;
      }
      .box details details[open] > summary::after {
        transform: rotate(-180deg);
      }

      .prop {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 8px;
        margin: 8px 0;
        background: rgba(0, 0, 0, 0.15);
      }
      .sum {
        color: var(--text-primary);
        font-weight: 600;
      }
      .tl {
        color: var(--text-secondary);
        font-size: 11px;
      }
      .code-card {
        background: rgba(10, 10, 12, 0.45);
        border: 1px solid var(--border-color);
        border-left: 3px solid var(--accent-color);
        border-radius: 8px;
        padding: 8px 12px;
        margin: 6px 0;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
      }
      .code-card pre {
        white-space: pre-wrap;
        margin: 0;
        font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 11px;
        line-height: 1.5;
        color: var(--text-primary);
        background: none;
        border: none;
        padding: 0;
        overflow-x: auto;
      }
      .code-card-header {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 6px;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 4px;
        color: var(--accent-color);
      }
      .note {
        color: var(--text-secondary);
        font-size: 11px;
        line-height: 1.5;
      }
      label {
        font-weight: 600;
        font-size: 11px;
        color: var(--text-secondary);
        display: block;
        margin-top: 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      h4 { margin: 6px 0 2px }
      .spinner { width: 22px; height: 22px; border: 2px solid var(--border-color); border-top-color: var(--accent-color); border-radius: 50%; animation: aid-spin 0.8s linear infinite; display: inline-block; }
      @keyframes aid-spin { to { transform: rotate(360deg); } }

      /* Glassmorphic Overlay / Modal */
      .box .overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(10, 10, 14, 0.98);
        backdrop-filter: blur(30px);
        -webkit-backdrop-filter: blur(30px);
        z-index: 20000;
        display: none;
        flex-direction: column;
        padding: 16px;
        box-sizing: border-box;
        overflow-y: auto;
        animation: slideUp 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
      }
      @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .box .overlay-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .box .overlay-title {
        font-weight: 800;
        font-size: 12px;
        color: var(--accent-color);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .box .overlay-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        display: inline-flex;
        align-items: center;
      }
      .box .overlay-close:hover {
        color: var(--text-primary);
        transform: scale(1.1);
      }
      .box .overlay-content {
        font-size: 11.5px;
        line-height: 1.6;
        color: var(--text-primary);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Tab Navigation for Main Panel */
      .main-tab-nav {
        display: flex;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 6px;
        gap: 6px;
        margin-top: 8px;
        box-sizing: border-box;
      }
      .main-tab-btn {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-weight: 600;
        cursor: pointer;
        padding: 5px 8px;
        font-size: 11px;
        border-radius: 8px;
        transition: all 0.2s ease;
      }
      .main-tab-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary);
        border-color: var(--accent-color);
      }
      .main-tab-btn.active {
        background: var(--accent-color);
        border-color: var(--accent-border);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 0 10px var(--accent-glow);
      }

      /* Slowly Pulsing Badge Notification */
      @keyframes slowPulse {
        0% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(217, 70, 239, 0.4); }
        50% { transform: scale(1.08); opacity: 1; box-shadow: 0 0 8px 3px rgba(217, 70, 239, 0.6); }
        100% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(217, 70, 239, 0.4); }
      }
      .box .badge-new-memories {
        background: linear-gradient(135deg, #d946ef, #a855f7);
        color: #ffffff;
        font-size: 9.5px;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 10px;
        margin-left: 6px;
        display: inline-block;
        vertical-align: middle;
        animation: slowPulse 2s infinite ease-in-out;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      /* Slow flashing/pinging animation for newly added memories */
      @keyframes cardPing {
        0% { border-color: var(--border-color); background: rgba(255, 255, 255, 0.01); box-shadow: 0 0 0px var(--accent-glow); }
        30% { border-color: var(--accent-color); background: var(--accent-glow); box-shadow: 0 0 12px var(--accent-glow); }
        100% { border-color: var(--border-color); background: rgba(255, 255, 255, 0.01); box-shadow: none; }
      }
      .box .memory-card.ping-new {
        animation: cardPing 4s 2 ease-in-out;
      }

      /* Slow pulsing animation for proposals */
      @keyframes slowPulseRed {
        0% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
        50% { transform: scale(1.08); opacity: 1; box-shadow: 0 0 8px 3px rgba(239, 68, 68, 0.6); }
        100% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      }
      .box .badge-new-proposals {
        background: linear-gradient(135deg, #ef4444, #f87171);
        color: #ffffff;
        font-size: 9.5px;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 10px;
        margin-left: 6px;
        display: inline-block;
        vertical-align: middle;
        animation: slowPulseRed 2s infinite ease-in-out;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      .box .badge-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        background: #ef4444;
        border-radius: 50%;
        margin-left: 5px;
        vertical-align: middle;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.8);
        animation: slowPulseRed 1.5s infinite ease-in-out;
      }
      .group-header.has-proposals {
        border-color: rgba(239, 68, 68, 0.3);
        border-left-color: #ef4444 !important;
        background: rgba(239, 68, 68, 0.03);
      }
      .group-header.has-proposals > summary {
        color: #fca5a5;
      }
      .group-header.has-proposals > summary::after {
        color: #ef4444;
      }

      /* AID Memories timeline cards */
      .box .memory-card {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.01);
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: all 0.25s ease;
      }
      .box .memory-card:hover {
        background: rgba(255, 255, 255, 0.03);
        border-color: rgba(255, 255, 255, 0.12);
      }
      .box .memory-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        color: var(--text-secondary);
      }
      .box .memory-card-text {
        font-size: 12px;
        line-height: 1.5;
        color: var(--text-primary);
        white-space: pre-wrap;
      }
      .box .memory-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;
        margin-right: 6px;
      }
      .box .memory-status-dot.active {
        background: var(--accent-color);
        box-shadow: 0 0 6px var(--accent-glow);
      }
      .box .memory-status-dot.used {
        background: #d946ef;
        box-shadow: 0 0 6px rgba(217, 70, 239, 0.4);
      }
      .box .memory-status-dot.stored {
        background: var(--text-secondary);
      }
    </style>
    <div class="box theme-emerald">
      <div id="drag-handle">
        <div id="st">AID Story Helper</div>
        <button id="min-toggle">\u2014</button>
      </div>
      <div id="self-heal-banner" style="display:none;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px;margin:8px;box-sizing:border-box;">
        <div style="font-weight:700;color:#f87171;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Empty Database Detected</div>
        <div class="note" style="margin:4px 0 8px 0;font-size:11px;line-height:1.4;color:var(--text-secondary);">It looks like your local IndexedDB is empty. If you have a backup, you can restore it now.</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="db-restore-trigger" style="background:rgba(239,68,68,0.2);color:#f87171;border:1px solid rgba(239,68,68,0.4);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600;min-height:unset;width:auto;">Restore from Backup</button>
          <button id="dismiss-self-heal-btn" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:10px;font-weight:600;padding:4px 8px;text-decoration:underline;margin:0;min-height:unset;width:auto;">Dismiss</button>
        </div>
      </div>
      <div id="toast">Settings saved</div>
      
      <div id="content-body" style="width:100%; flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0;">
        <!-- VIEW: TRACKER -->
        <div id="view-tracker" style="display:flex; flex-direction:column; flex:1; overflow:hidden; min-height:0;">
          <div id="meta-stats" style="margin:8px 0;padding:8px 12px;background:rgba(0,0,0,0.25);border-radius:8px;border:1px solid var(--border-color);display:flex;justify-content:space-between;font-size:10px;color:var(--text-secondary);font-family:SFMono-Regular,Consolas,monospace;">
            <div>Actions: <span id="stat-turn" style="color:var(--accent-color);font-weight:bold;">0</span></div>
            <div>Last Auto-Updated: <span id="stat-last-auto" style="color:var(--accent-color);font-weight:bold;">-</span></div>
          </div>

          <!-- Tab Navigation for Main Panel -->
          <div class="main-tab-nav" style="margin-bottom:8px;">
            <button class="main-tab-btn active" data-tab="main-tab-tracker" style="flex:1;white-space:nowrap;margin:0;position:relative;">Card Manager<span id="tracker-proposals-badge" style="display:none;"></span></button>
            <button class="main-tab-btn" data-tab="main-tab-memories" style="flex:1;white-space:nowrap;margin:0;position:relative;">Memory Bank<span id="unread-memories-badge" style="display:none;"></span></button>
          </div>

          <!-- Main Pane 1: Card Manager -->
          <div id="main-tab-tracker" class="main-tab-pane" style="display:flex; flex-direction:column; flex:1; overflow:hidden; min-height:0;">
            <div id="location-banners-container" style="flex-shrink:0;"></div>
            <div id="view-tracker-scrollable">
              <div id="results"></div>
            </div>
          </div>

          <!-- Main Pane 2: AID Memories Timeline -->
          <div id="main-tab-memories" class="main-tab-pane" style="display:none; flex-direction:column; flex:1; overflow:hidden; min-height:0;">
            <div style="display:flex; gap:6px; margin-bottom:8px;">
              <button id="refine-mem" style="flex:1; margin:0; background:linear-gradient(135deg, var(--accent-color), var(--accent-border)); color:#fff; font-weight:600; padding:6px; border-radius:6px; border:none; cursor:pointer; font-size:10px;">\u26A1 Regenerate Latest</button>
            </div>
            <div id="aid-memories-scrollable" style="flex:1; overflow-y:auto; padding-right:4px; min-height:0;">
              <div id="aid-memories-list" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>
          </div>

          <!-- Pinned Main Footer -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-color);box-sizing:border-box;">
            <div style="display:flex;gap:12px;align-items:center;">
              <button id="open-settings" style="background:none;border:none;padding:4px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;" title="Settings">
                <svg style="width:16px;height:16px;fill:currentColor;" viewBox="0 0 24 24">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.13,5.91,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.67,9.34,2.85,9.48l2.03,1.58C4.83,11.36,4.81,11.69,4.81,12c0,0.31,0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                </svg>
              </button>
              <button id="bf" title="Backfill Scenario History">\u2913 Backfill</button>
            </div>
            
            <button id="create-card-trigger" style="background:var(--accent-color);color:#fff;border:none;border-radius:4px;padding:3.5px 8px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 1px 3px rgba(0,0,0,0.2);" title="Create Story Card">
              <span>+ Add Card</span>
            </button>

            <div style="display:flex;gap:6px;align-items:center;">
              <div style="font-size:10px;color:var(--text-secondary);font-family:system-ui;">v${version}</div>
              <button id="info-help" type="button" style="background:none;border:none;padding:2px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;" title="About & How it works">
                <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <!-- VIEW: SETTINGS -->
        <div id="view-settings" style="display:none;flex-direction:column;gap:10px;margin-top:8px;flex:1;overflow:hidden;min-height:0;">
          <!-- Tab Navigation -->
          <div class="tab-nav" style="display:flex;border-bottom:1px solid var(--border-color);padding-bottom:6px;gap:4px;overflow-x:auto;">
            <button class="tab-btn active" data-tab="tab-gen" style="flex:1;white-space:nowrap;margin:0;">General</button>
            <button class="tab-btn" data-tab="tab-prov" style="flex:1;white-space:nowrap;margin:0;">AI Provider</button>
            <button class="tab-btn" data-tab="tab-memoraid" style="flex:1;white-space:nowrap;margin:0;">MemorAID</button>
            <button class="tab-btn" data-tab="tab-prompts" style="flex:1;white-space:nowrap;margin:0;">Prompts</button>
            <button class="tab-btn" data-tab="tab-offmeta" style="flex:1;white-space:nowrap;margin:0;">OffMeta's AIN</button>
            <button class="tab-btn" data-tab="tab-manager" style="flex:1;white-space:nowrap;margin:0;">Adventures Manager</button>
            <button class="tab-btn" data-tab="tab-debug" style="flex:1;white-space:nowrap;margin:0;">Debug</button>
          </div>
          
          <!-- Tab Panes -->
          <div class="tab-content">
            <!-- Pane: General Settings -->
            <div id="tab-gen" class="tab-pane" style="display:block;">
              <label>Theme</label>
              <select id="theme" style="margin:4px 0 8px 0;">
                <option value="emerald">Modern Emerald</option>
                <option value="synthwave">Synthwave Purple</option>
                <option value="amber">Cyber Amber</option>
                <option value="sapphire">Plasma Sapphire</option>
              </select>
              
              <label>Protagonist Name</label>
              <input id="prot" type="text" placeholder="e.g. Smoke" style="margin:4px 0 8px 0;" />
              
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="auto-regen-memories" type="checkbox" style="width:auto;margin:0;" />
                  Automatically regen latest Memory Bank entry?
                </label>
              </div>
              
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Action Lookback Window</label>
                <button id="info-action-lookback" type="button" style="background:none;border:none;padding:2px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;" title="About Action Lookback Window">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="win" type="number" min="1" placeholder="20" style="margin:4px 0 4px 0;" />
              
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Character Card Character Limit</label>
              </div>
              <input id="char-card-limit" type="number" min="100" max="2000" placeholder="600" style="margin:4px 0 8px 0;" />

              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:4px 0 10px 0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="enable-manual-mode" type="checkbox" style="width:auto;margin:0;" />
                Enable Manual Mode - No Automatic Updates
              </label>

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Active Location Sync Mode</label>
              </div>
              <select id="location-mode" style="margin:4px 0 8px 0;">
                <option value="optionA">Option A: Direct Plot Essentials Tagging</option>
                <option value="optionB">Option B: Active Location Anchor Card</option>
              </select>

              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:10px 0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="enable-proper-noun-detection" type="checkbox" style="width:auto;margin:0;" checked />
                Auto Proper Noun Detection?
              </label>
              
              <button id="grant-permissions" type="button" class="btn" style="margin-top:12px;background:var(--accent-color);color:#fff;width:100%;font-weight:600;font-size:11px;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:6px;border:none;cursor:pointer;">
                <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
                Grant AI Dungeon Permissions
              </button>
            </div>
            
            <!-- Pane: MemorAID Settings -->
            <div id="tab-memoraid" class="tab-pane" style="display:none; flex-direction:column; gap:8px;">
              <div id="memoraid-tab-config-banner-container"></div>
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="use-memories" type="checkbox" style="width:auto;margin:0;" />
                  Use Memories in Plot Essentials?
                </label>
                <button id="info-memories" type="button" style="background:none;border:none;padding:2px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;" title="How Memories work">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Action Lookback Window</label>
                <button id="info-memoraid-lookback" type="button" style="background:none;border:none;padding:2px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;" title="About MemorAID Action Lookback Window">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-win" type="number" min="1" placeholder="8" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Thought Lookback (previous thoughts)</label>
                <button id="info-memoraid-thought" type="button" style="background:none;border:none;padding:2px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;" title="About MemorAID Thought Lookback">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-thought-win" type="number" min="1" placeholder="1" style="margin:4px 0 2px 0;" />
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">
                <i>* Braced rolling window format is used when setting is greater than 1.</i>
              </div>

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Thought Card Character Limit</label>
              </div>
              <input id="thought-card-limit" type="number" min="100" max="4000" placeholder="2000" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Scene Presence Lookback</label>
                <button id="info-memoraid-presence" type="button" style="background:none;border:none;padding:2px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;" title="About MemorAID Scene Presence Lookback">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-presence-win" type="number" min="1" placeholder="5" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Action Intercept Timeout (Seconds)</label>
                <button id="info-intercept-timeout" type="button" style="background:none;border:none;padding:2px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;" title="About Action Intercept Timeout">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="intercept-timeout" type="number" min="1" placeholder="10" style="margin:4px 0 4px 0;" />
              <div id="intercept-timing-stats" style="margin:0 0 10px 0;font-size:10px;color:var(--text-secondary);line-height:1.5;letter-spacing:normal;text-transform:none;">
                <span>Last MemorAID run: <strong id="intercept-timing-last" style="color:var(--text-primary);">\u2013</strong></span>
                <span style="opacity:0.5;"> &middot; </span>
                <span>Session avg: <strong id="intercept-timing-avg" style="color:var(--text-primary);">\u2013</strong></span>
              </div>
            </div>
            
            <!-- Pane: AI Provider -->
            <div id="tab-prov" class="tab-pane" style="display:none;">
              <label>Provider</label>
              <select id="prov" style="margin:4px 0 8px 0;">
                <option value="claude">Anthropic Claude</option>
                <option value="openai">OpenAI ChatGPT</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Local Ollama</option>
              </select>
              
              <label id="key-lbl">Claude API key</label>
              <input id="key" type="text" autocomplete="off" placeholder="sk-ant-..." style="-webkit-text-security: disc; margin:4px 0 8px 0;" />
              
              <label>Model</label>
              <div id="model-combo" style="position:relative;margin:4px 0 8px 0;">
                <input id="model-search" type="text" autocomplete="off" spellcheck="false" placeholder="Search models\u2026" style="margin:0;width:100%;box-sizing:border-box;" />
                <div id="model-list" role="listbox" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 2px);z-index:60;max-height:240px;overflow-y:auto;background:var(--bg-glass);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);"></div>
                <select id="model" style="display:none;"><option value="">(enter API key)</option></select>
              </div>
              
              <div id="gemma-disclaimer" class="note" style="margin-top:12px;padding:8px;border-radius:6px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.25);color:#fca5a5;font-size:10.5px;line-height:1.4;display:none;">
                <strong>Disclaimer:</strong> Google's Gemma models (Gemma 4 26B &amp; Gemma 4 31B) have strict Layer 2 NSFW restrictions on the API. Because these filters can cause the API to fail, they may only work intermittently depending on the content of your story.
              </div>
            </div>
            
            <!-- Pane: Prompts -->
            <div id="tab-prompts" class="tab-pane" style="display:none;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px;width:100%;box-sizing:border-box;">
                <details style="border:none;background:none;margin:0;padding:0;flex:1;overflow:visible;">
                  <summary style="cursor:pointer;font-size:10px;font-weight:600;color:var(--accent-color);padding:0 24px 0 0;background:none;display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;">
                    <span>Available Dynamic Tags</span>
                  </summary>
                  <div style="margin-top:4px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:6px;padding:6px;font-size:9.5px;color:var(--text-secondary);line-height:1.4;box-sizing:border-box;width:100%;">
                    <div><code style="color:var(--accent-color);font-weight:bold;">{protagonist}</code> - Replaced by us with the protagonist name (from General, or auto-detected from Plot Essentials) before sending.</div>
                    <div style="margin-top:3px;"><code style="color:var(--accent-color);font-weight:bold;">{{title}}</code> - Resolved by AI Dungeon to the Story Card's title. Required in every Card Command.</div>
                  </div>
                </details>
                <button id="revert-prompt" style="background:rgba(239,68,68,0.05);color:#fca5a5;border:1px solid rgba(239,68,68,0.2);padding:2px 6px;font-size:9.5px;border-radius:4px;margin:0;white-space:nowrap;align-self:flex-start;">\u21BA Revert All</button>
              </div>

              <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Plot Essentials Prompt (your AI provider)</h4>
              <div class="note" style="margin-bottom:4px;">Drives Plot Essentials updates via your configured provider (Claude/GPT/etc). Story Card templates are configured below.</div>
              <label style="margin-top:6px;">1. General Instructions</label>
              <textarea id="prompt-s1" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">2. Personality & Identity Rules</label>
              <textarea id="prompt-s2" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">3. Limits & Budget Ceilings</label>
              <textarea id="prompt-s3" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">4. Output JSON Schema</label>
              <textarea id="prompt-s4" rows="5" style="margin:4px 0 8px 0;"></textarea>

              <div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:8px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Per-Type Card Command Templates (AI Provider)</h4>
                <div class="note" style="margin-bottom:6px;">Executed through your configured AI Provider \u2014 uses the model and settings from the AI Provider tab. Use <code>{{title}}</code> (required; replaced by card title) and <code>{protagonist}</code>. Custom covers any user-named type (e.g. "Song").</div>

                <label style="margin-top:6px;">Entry Formatting</label>
                <select id="fmt-mode" style="margin:4px 0 8px 0;">
                  <option value="squareBrackets">[ ] Square brackets</option>
                  <option value="curlyBraces">{ } Curly braces</option>
                  <option value="none">None</option>
                </select>

                <label style="margin-top:6px;">Character</label><textarea id="cc-character" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Class</label><textarea id="cc-class" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Race</label><textarea id="cc-race" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Location</label><textarea id="cc-location" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Faction</label><textarea id="cc-faction" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Custom</label><textarea id="cc-custom" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Memoraid</label><textarea id="cc-memoraid" rows="6" style="margin:4px 0 6px 0;"></textarea>
              </div>
            </div>
            
            <!-- Pane: Debug / Exports -->
            <div id="tab-debug" class="tab-pane" style="display:none;">
              <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Granular Database Exports</h4>
              <div class="note" style="margin-bottom:8px;">Select an export type to download the data:</div>
              
              <div style="display:flex;flex-direction:column;gap:6px;width:100%;">
                <button id="ex-story" style="justify-content:flex-start;background:rgba(16,185,129,0.05);color:#34d399;border:1px solid rgba(16,185,129,0.2);padding:6px 10px;text-align:left;width:100%;box-sizing:border-box;">
                  <span>\u2B07 Just Story Actions JSON</span>
                </button>
                <button id="ex-cards" style="justify-content:flex-start;background:rgba(16,185,129,0.05);color:#34d399;border:1px solid rgba(16,185,129,0.2);padding:6px 10px;text-align:left;width:100%;box-sizing:border-box;">
                  <span>\u2B07 Just Story Cards JSON</span>
                </button>
                <button id="ex-pe" style="justify-content:flex-start;background:rgba(16,185,129,0.05);color:#34d399;border:1px solid rgba(16,185,129,0.2);padding:6px 10px;text-align:left;width:100%;box-sizing:border-box;">
                  <span>\u2B07 Just Plot Essentials Plaintext</span>
                </button>
                <button id="ex-aidmemories" style="justify-content:flex-start;background:rgba(16,185,129,0.05);color:#34d399;border:1px solid rgba(16,185,129,0.2);padding:6px 10px;text-align:left;width:100%;box-sizing:border-box;">
                  <span>\u2B07 Just Memory Bank JSON</span>
                </button>
                <button id="ex-propernouns" style="justify-content:flex-start;background:rgba(16,185,129,0.05);color:#34d399;border:1px solid rgba(16,185,129,0.2);padding:6px 10px;text-align:left;width:100%;box-sizing:border-box;">
                  <span>\u2B07 Just Proper Noun Logs JSON</span>
                </button>
                <button id="ex-all" style="justify-content:flex-start;background:rgba(245,158,11,0.05);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);padding:6px 10px;text-align:left;width:100%;box-sizing:border-box;">
                  <span>\u2B07 All Combined Backup JSON</span>
                </button>
              </div>

              <h4 style="margin:14px 0 4px;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Diagnostics</h4>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:4px 0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="show-dbg" type="checkbox" style="width:auto;margin:0;" />
                Verbose debug logging (Console)
              </label>
              <div class="note">Logs detailed internal extension activity to the browser Console (developer diagnostic \u2014 noisy).</div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:8px 0 4px;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="log-pe-console" type="checkbox" style="width:auto;margin:0;" />
                Log Raw Update Plot Essentials to Console
              </label>
              <div class="note">When enabled, logs ONLY the raw AI request/response from the last Update Plot Essentials run to the browser Console (open DevTools \u2192 Console). Independent of verbose logging above.</div>
              
              <div style="margin-top:14px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Learned Operations</h4>
                <div id="learned-ops-list" style="font-family:SFMono-Regular,Consolas,monospace;font-size:9.5px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:6px;padding:6px;margin-top:4px;color:var(--text-primary);max-height:80px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;">None</div>
              </div>

              <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <h4 style="margin:0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Proper Noun Log Editor</h4>
                  <button id="clear-pn-logs" style="margin:0;padding:2px 6px;font-size:9.5px;background:rgba(239,68,68,0.1);color:#fca5a5;border:1px solid rgba(239,68,68,0.2);border-radius:4px;cursor:pointer;">Clear All</button>
                </div>
                <div class="note" style="margin-bottom:6px;">Review or delete proper nouns processed by auto-detection.</div>
                <div id="pn-logs-list" style="max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:6px;padding:6px;box-sizing:border-box;">
                  <!-- Proper noun log items -->
                </div>
              </div>
              
              <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Full Database Backup & Restore</h4>
                <div class="note" style="margin-bottom:8px;">Back up the entire local database (settings, cards, versions, operations, histories) to a single file.</div>
                <div style="display:flex;gap:6px;width:100%;">
                  <button class="db-backup-trigger" style="flex:1;justify-content:center;background:rgba(16,185,129,0.08);color:#34d399;border:1px solid rgba(16,185,129,0.25);padding:6px;font-weight:600;font-size:11px;border-radius:6px;cursor:pointer;">Back Up Database</button>
                  <button class="db-restore-trigger" style="flex:1;justify-content:center;background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);padding:6px;font-weight:600;font-size:11px;border-radius:6px;cursor:pointer;">Restore from Backup</button>
                </div>
              </div>
            </div>
            
            <!-- Pane: OffMeta's AIN Repository -->
            <div id="tab-offmeta" class="tab-pane" style="display:none; flex-direction:column; gap:8px; overflow:hidden;">
              <h4 style="margin:4px 0;font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">OffMeta's AIN Repository</h4>
              <div class="note" style="margin-bottom:4px; font-size:11px;">Apply curated instructions directly to your AI Instructions, Author's Note, or Plot Essentials.</div>
              
              <!-- Sub Tab Navigation -->
              <div class="offmeta-subtab-nav" style="display:flex;border-bottom:1px solid var(--border-color);padding-bottom:4px;margin-bottom:6px;gap:2px;overflow-x:auto;">
                <button class="offmeta-subtab-btn active" data-subtab="offmeta-subtab-intro" style="flex:1;white-space:nowrap;margin:0;padding:5px 6px;font-size:11px;background:none;border:none;color:var(--theme-text-color);border-bottom:2px solid var(--theme-text-color);font-weight:700;cursor:pointer;transition:all 0.2s;">Introduction</button>
                <button class="offmeta-subtab-btn" data-subtab="offmeta-subtab-premade" style="flex:1;white-space:nowrap;margin:0;padding:5px 6px;font-size:11px;background:none;border:none;color:var(--text-secondary);border-bottom:2px solid transparent;cursor:pointer;transition:all 0.2s;">Premade AIN</button>
                <button class="offmeta-subtab-btn" data-subtab="offmeta-subtab-anpe" style="flex:1;white-space:nowrap;margin:0;padding:5px 6px;font-size:11px;background:none;border:none;color:var(--text-secondary);border-bottom:2px solid transparent;cursor:pointer;transition:all 0.2s;">AN/PE</button>
                <button class="offmeta-subtab-btn" data-subtab="offmeta-subtab-individual" style="flex:1;white-space:nowrap;margin:0;padding:5px 6px;font-size:11px;background:none;border:none;color:var(--text-secondary);border-bottom:2px solid transparent;cursor:pointer;transition:all 0.2s;">Individual AIN</button>
              </div>

              <!-- Search box and status feedback -->
              <div id="offmeta-search-container" style="display:none; flex-direction:column; gap:6px; margin-bottom:4px;">
                <input id="offmeta-search" type="text" placeholder="Search instructions (e.g. repetition, romance)..." style="width:100%; box-sizing:border-box; margin:0; font-size:11.5px; padding:5px 8px;" />
                <div id="offmeta-status" style="font-size:11px; display:none; padding:4px 8px; border-radius:4px; font-weight:600; line-height:1.35; margin-top:2px;"></div>
              </div>

              <!-- Repository container -->
              <div id="offmeta-repo-container" style="display:flex; flex-direction:column; gap:12px; flex:1; overflow-y:auto; padding-right:4px; min-height:0;">
                <!-- Loading State placeholder -->
                <div style="text-align:center; padding:30px; color:var(--text-secondary);">
                  <div class="spinner" style="width:16px; height:16px; margin-bottom:6px; border-width:2px;"></div>
                  <div>Fetching rules from Google Doc...</div>
                </div>
              </div>
            </div>
            
            <!-- Pane: Adventures Manager -->
            <div id="tab-manager" class="tab-pane" style="display:none; flex-direction:column; gap:8px; overflow:hidden;">
              <h4 style="margin:4px 0;font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Adventures Manager</h4>
              <div class="note" style="margin-bottom:4px; font-size:11px;">Manage your Global Asset library and explore locally stored adventure data.</div>
              
              <!-- Sub Tab Navigation -->
              <div class="manager-subtab-nav" style="display:flex;border-bottom:1px solid var(--border-color);padding-bottom:4px;margin-bottom:6px;gap:2px;">
                <button id="btn-subtab-global" class="manager-subtab-btn active" style="flex:1;white-space:nowrap;margin:0;padding:5px 6px;font-size:11px;background:none;border:none;color:var(--theme-text-color);border-bottom:2px solid var(--theme-text-color);font-weight:700;cursor:pointer;">Global Bucket</button>
                <button id="btn-subtab-explorer" class="manager-subtab-btn" style="flex:1;white-space:nowrap;margin:0;padding:5px 6px;font-size:11px;background:none;border:none;color:var(--text-secondary);border-bottom:2px solid transparent;cursor:pointer;">Local DB Explorer</button>
              </div>

              <!-- Main Manager Container -->
              <div id="manager-panels" style="display:flex; flex-direction:column; gap:8px; flex:1; overflow-y:auto; padding-right:4px; min-height:0;">
                <!-- Subpane: Global Assets -->
                <div id="subpane-global" style="display:flex; flex-direction:column; gap:8px;">
                  <button id="btn-show-add-global" style="width:100%;margin:0;background:linear-gradient(135deg, var(--accent-color), var(--accent-border));color:#fff;font-weight:600;padding:6px;border-radius:6px;border:none;cursor:pointer;font-size:11px;">+ Add New Global Asset</button>
                  
                  <!-- Form: Add Global Asset (hidden by default) -->
                  <div id="form-add-global" style="display:none; flex-direction:column; gap:6px; background:rgba(0,0,0,0.25); border:1px solid var(--border-color); border-radius:8px; padding:10px; box-sizing:border-box;">
                    <div style="font-weight:600; font-size:11px; color:var(--theme-text-color); margin-bottom:4px;">New Global Asset</div>
                    <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Asset Type</label>
                    <select id="global-type" style="margin:2px 0 6px 0; font-size:11.5px; padding:4px;">
                      <option value="ain">AI Instructions (AIN)</option>
                      <option value="an">Author's Note (AN)</option>
                      <option value="pe">Character Description (PE)</option>
                      <option value="sc">Story Card (SC)</option>
                    </select>

                    <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Title / Name</label>
                    <input id="global-title" type="text" placeholder="e.g. My Custom Rules or Character Name" style="margin:2px 0 6px 0; font-size:11.5px; padding:4px;" />

                    <!-- SC specific fields -->
                    <div id="sc-fields" style="display:none; flex-direction:column; gap:6px;">
                      <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Story Card Type</label>
                      <select id="global-sc-type" style="margin:2px 0 6px 0; font-size:11.5px; padding:4px;">
                        <option value="character">Character</option>
                        <option value="location">Location</option>
                        <option value="faction">Faction</option>
                        <option value="class">Class</option>
                        <option value="race">Race</option>
                        <option value="custom">Custom</option>
                      </select>

                      <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Keys / Triggers (comma-separated)</label>
                      <input id="global-keys" type="text" placeholder="e.g. elf,legolas" style="margin:2px 0 6px 0; font-size:11.5px; padding:4px;" />

                      <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Description (Notes/Thought Log)</label>
                      <textarea id="global-description" rows="2" placeholder="Sleek details..." style="margin:2px 0 6px 0; font-size:11.5px; padding:4px; font-family:inherit; resize:vertical;"></textarea>
                    </div>

                    <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Content / Instruction Value</label>
                    <textarea id="global-value" rows="4" placeholder="Enter content or instructions here..." style="margin:2px 0 6px 0; font-size:11.5px; padding:4px; font-family:inherit; resize:vertical;"></textarea>

                    <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:4px;">
                      <button id="btn-cancel-global" style="margin:0; padding:4px 10px; font-size:11px; background:rgba(255,255,255,0.05); border-radius:6px; border:1px solid var(--border-color); color:var(--text-secondary);">Cancel</button>
                      <button id="btn-save-global" style="margin:0; padding:4px 10px; font-size:11px; background:var(--accent-color); color:#fff; border-radius:6px; border:none; font-weight:600;">Create</button>
                    </div>
                  </div>

                  <!-- Global Assets Categorized Lists -->
                  <div id="global-assets-list" style="display:flex; flex-direction:column; gap:8px;"></div>
                </div>

                <!-- Subpane: Local DB Explorer -->
                <div id="subpane-explorer" style="display:none; flex-direction:column; gap:8px;">
                  <div id="db-explorer-list" style="display:flex; flex-direction:column; gap:8px;"></div>
                  <div style="display:flex; justify-content:flex-start; margin-top:8px;">
                    <button id="btn-view-hidden-adv" style="background:none !important; border:none !important; box-shadow:none !important; transform:none !important; padding:4px 0; color:var(--text-secondary); text-decoration:underline; font-size:10.5px; cursor:pointer; font-family:inherit; transition:color 0.2s;" onmouseover="this.style.color='var(--theme-text-color)'" onmouseout="this.style.color='var(--text-secondary)'">View Hidden Adventures</button>
                  </div>
                </div>
              </div>
              
              <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Full Database Backup & Restore</h4>
                <div class="note" style="margin-bottom:8px;">Back up the entire local database (settings, cards, versions, operations, histories) to a single file.</div>
                <div style="display:flex;gap:6px;width:100%;">
                  <button class="db-backup-trigger" style="flex:1;justify-content:center;background:rgba(16,185,129,0.08);color:#34d399;border:1px solid rgba(16,185,129,0.25);padding:6px;font-weight:600;font-size:11px;border-radius:6px;cursor:pointer;">Back Up Database</button>
                  <button class="db-restore-trigger" style="flex:1;justify-content:center;background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);padding:6px;font-weight:600;font-size:11px;border-radius:6px;cursor:pointer;">Restore from Backup</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Actions footer for settings view -->
          <div id="settings-footer" style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border-color);padding-top:8px;margin-top:4px;">
            <button id="cancel-settings" style="margin:0;background:rgba(255,255,255,0.02);padding:4px 10px;border-radius:6px;">Cancel</button>
            <button id="save" style="margin:0;background:linear-gradient(135deg, var(--accent-color), var(--accent-border));color:#fff;font-weight:600;min-width:70px;padding:4px 10px;border-radius:6px;border:none;">Save</button>
          </div>
        </div>

        <!-- VIEW: UPDATE PLOT ESSENTIALS (Analyze) -->
        <div id="view-analyze" style="display:none;flex-direction:column;gap:10px;margin-top:8px;flex:1;overflow:hidden;min-height:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);padding-bottom:6px;">
            <div style="font-weight:600;color:var(--accent-color);font-size:13px;">\u27F3 Update Plot Essentials</div>
            <button id="analyze-back" style="margin:0;background:rgba(255,255,255,0.02);padding:4px 10px;border-radius:6px;">\u2190 Back</button>
          </div>
          <div id="analyze-body"></div>
        </div>

        <!-- OVERLAY: MEMORIES HELP -->
        <div id="overlay-memories" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Memories Block Feature</div>
            <button class="overlay-close" type="button" data-close="overlay-memories">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>When enabled, the tracker will automatically manage a <strong>[Memories (newest to oldest): ...]</strong> block inside your adventure's Plot Essentials.</p>
            <p><strong>Setup Format:</strong><br/>Create a block in your Plot Essentials exactly like this:</p>
            <div class="code-card" style="margin:4px 0;"><pre>[Memories (newest to oldest):
- latest memory here
- something that happened before that
]</pre></div>
            <p><strong>How it works:</strong><br/>The AI analyzes your gameplay actions, summarizes new events, and automatically prepends them as new bullet points to keep a continuous running history of your story.</p>
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:8px 12px;color:#fbe3b4;display:flex;gap:8px;align-items:flex-start;">
              <svg style="width:16px;height:16px;fill:currentColor;flex-shrink:0;margin-top:2px;" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
              <span><strong>Note:</strong> A longer lookback window (e.g. 60+ actions) is highly recommended for the AI to have enough context to generate high-quality, continuous memories.</span>
            </div>
          </div>
        </div>

        <!-- OVERLAY: ACTION LOOKBACK HELP -->
        <div id="overlay-action-lookback" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Action Lookback Window</div>
            <button class="overlay-close" type="button" data-close="overlay-action-lookback">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls the number of recent gameplay actions and the resulting text from AI Dungeon sent to your third-party provider for story card updates.</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID LOOKBACK HELP -->
        <div id="overlay-memoraid-lookback" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Action Lookback Window</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-lookback">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls how many actions (turns) of recent gameplay context the extension retrieves to use as additional context for the NPC's Thought Card generation.</p>
            <p><strong>How it works:</strong><br/>When generating a MemorAID thought card (sensory Intake \u2192 internal Thought \u2192 next Action), the extension looks back at this number of turns of active history to build the narrative generation context. Adjusting this allows for more detailed context reflection but consumes more text from the history budget.</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID THOUGHT HELP -->
        <div id="overlay-memoraid-thought" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Thought Lookback</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-thought">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls how many prior thoughts generated by MemorAID are kept in the card value and fed back to the AI provider as rolling context.</p>
            <p>This controls the rolling thought window size. Up to N of the most recent thoughts will be kept in the memory card value and fed back as context (default = 1, keeping only the newest thought).</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID PRESENCE HELP -->
        <div id="overlay-memoraid-presence" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Scene Presence Lookback</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-presence">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls how many actions (turns) the extension looks back to check if an NPC has been active or mentioned in the scene to trigger the MemorAID intercept and update.</p>
            <p><strong>How it works:</strong><br/>Each time you enter an action, the extension scans the last <code>N</code> actions (defined by this window) to see if an important character is present. If they are detected, it runs the intercept and updates the thought cards. A smaller window keeps the detection tightly focused on the immediate scene, while a larger window allows characters to stay active even after a few turns of silence.</p>
          </div>
        </div>

        <!-- OVERLAY: INTERCEPT TIMEOUT HELP -->
        <div id="overlay-intercept-timeout" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Action Intercept Timeout</div>
            <button class="overlay-close" type="button" data-close="overlay-intercept-timeout">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls how many seconds the extension pauses your gameplay actions to wait for NPC thought cards to regenerate before releasing the turn.</p>
            <p><strong>How it works:</strong><br/>When you submit an action in a scene with active characters, the extension intercepts it and triggers background thought updates. It holds your action up to this timeout to let the AI updates finish and show in the input placeholder. Increase this if you have multiple active NPCs to ensure all their thoughts update before the turn is released.</p>
          </div>
        </div>

        <!-- OVERLAY: CREATE NEW STORY CARD -->
        <div id="overlay-add-card" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Create New Story Card</div>
            <button class="overlay-close" type="button" data-close="overlay-add-card">\xD7</button>
          </div>
          <div class="overlay-content" style="gap:10px;">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Card Type</label>
              <select id="ac-type" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;padding:6px;font-size:11px;font-family:inherit;margin:2px 0 4px 0;">
                <option value="character">Character</option>
                <option value="location">Location</option>
                <option value="faction">Faction</option>
                <option value="class">Class</option>
                <option value="race">Race</option>
                <option value="custom">Custom</option>
                <option value="memory">Memory</option>
              </select>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Name / Title</label>
              <input id="ac-title" type="text" placeholder="e.g. Rena" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;padding:6px;font-size:11px;font-family:inherit;margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Trigger Keys (comma-separated)</label>
              <input id="ac-keys" type="text" placeholder="e.g. rena, merchant" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;padding:6px;font-size:11px;font-family:inherit;margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Description / Notes</label>
              <input id="ac-desc" type="text" placeholder="e.g. Optional notes" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;padding:6px;font-size:11px;font-family:inherit;margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Entry Value (Body)</label>
              <textarea id="ac-value" placeholder="The core story card content..." style="background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px;font-size:11px;font-family:inherit;resize:none;flex:1;min-height:80px;box-sizing:border-box;margin:2px 0 4px 0;"></textarea>
            </div>

            <button id="ac-submit" style="width:100%;margin-top:4px;background:linear-gradient(135deg, var(--accent-color), var(--accent-border));color:#fff;font-weight:600;padding:8px;border-radius:6px;border:none;cursor:pointer;font-size:11px;">Create & Push to AID</button>
          </div>
        </div>

        <!-- OVERLAY: GENERAL ABOUT & HELP -->
        <div id="overlay-help" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">About & How it Works</div>
            <button class="overlay-close" type="button" data-close="overlay-help">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This extension orchestrates context tracking and memory management for your AI Dungeon adventures, dynamically partitioning updates between your private AI APIs and AI Dungeon's native generators.</p>
            
            <p><strong>1. Architectural Division: PE vs SC</strong></p>
            <ul style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:8px;">
              <li>
                <strong>Plot Essentials (PE):</strong> 
                Character blocks embedded directly inside your adventure's main memory context. Updates are fully driven by <strong>your configured outside AI Provider API</strong> (Claude, OpenAI GPT, Gemini, or local Ollama).
                <br/><span class="note" style="margin-top:2px;display:inline-block;">*Includes an option (enabled via <strong>Settings \u2192 General \u2192 Use Memories in Plot Essentials?</strong>) to automatically construct and prepend a dynamic Memories block in Plot Essentials via outside AI calls.</span>
              </li>
              <li>
                <strong>Story Cards (SC):</strong> 
                World Info elements stored in AI Dungeon's database. Updates are driven by <strong>your configured outside AI Provider API</strong> using the command templates defined in settings, and committed back via GQL mutations.
              </li>
            </ul>

            <p><strong>2. Gameplay Context Window Integration</strong></p>
            <p>When generating Story Card updates, the extension dynamically captures the last <code>N</code> actions of chronological gameplay history (up to the provider's context limits) and feeds it to your outside AI provider. For Location cards, the current card description is automatically prepended, reserving all remaining character budget for recent gameplay actions.</p>

            <p><strong>3. Automated Action Lookback Active Tracker</strong></p>
            <p>The tracker continuously monitors action progression in the background. If a character's name or trigger words were present in the previous lookback window but disappear from the current window (indicating <strong>they have just fell out of active gameplay actions / exited the active scene</strong>), the extension automatically and silently triggers a card update in the background.</p>
            <p>A new pending proposal is generated immediately, ready for you to review, accept, or reject the moment you open the Tracker panel!</p>

            <p><strong>4. How it Determines Characters</strong></p>
            <p>The tracker parses your adventure's Plot Essentials memory to identify existing characters by looking for these patterns:</p>
            <ul style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px;">
              <li><code>Your name: Smoke</code> (identifies the protagonist)</li>
              <li><code>[Name is/are ...]</code> or <code>Name is/are ...</code></li>
              <li><code>[Name: ...]</code> or <code>Name: ...</code></li>
            </ul>

            <p><strong>5. MemorAID NPC Thought Tracking</strong></p>
            <p>The extension intercepts outgoing player actions to generate and synchronize thoughts for active NPCs in companion thought cards.
            <br/><span class="note" style="margin-top:2px;display:inline-block;">*Settings under the MemorAID tab allow you to define the lookback size and customize the intercept release timeout to wait for background thought updates to finish before releasing the turn.</span></p>

            <p><strong>6. Memory Bank & Auto-Regeneration</strong></p>
            <p>You can edit and refine individual AI Dungeon memory blocks directly from the Memory Bank tab.
            <br/><span class="note" style="margin-top:2px;display:inline-block;">*Enabling <strong>Settings \u2192 General \u2192 Automatically regen latest Memory Bank entry?</strong> automatically runs memory block refinement on the latest memory block whenever new actions are synchronized, using loop-safe diffing to prevent endless loops.</span></p>
          </div>
        </div>
      </div>
    </div>`);
    document.documentElement.appendChild(host);
    function checkUrlVisibility() {
      const isSettingsUrl = location.pathname === "/settings" || location.pathname.endsWith("/settings");
      host.style.display = isSettingsUrl ? "none" : "block";
    }
    setInterval(checkUrlVisibility, 1e3);
    checkUrlVisibility();
    let lastState = null;
    const $ = (id) => root.getElementById(id);
    const st = $("st"), results = $("results");
    const keyEl = $("key"), protEl = $("prot"), modelEl = $("model"), winEl = $("win");
    const memoraidWinEl = $("memoraid-win"), memoraidThoughtWinEl = $("memoraid-thought-win"), memoraidPresenceWinEl = $("memoraid-presence-win");
    const interceptTimeoutEl = $("intercept-timeout");
    const charCardLimitEl = $("char-card-limit");
    const thoughtCardLimitEl = $("thought-card-limit");
    const provEl = $("prov"), keyLblEl = $("key-lbl");
    const themeEl = $("theme");
    function applyMemoraidTiming(stats) {
      const fmt = (ms) => ms == null ? "\u2013" : `${(ms / 1e3).toFixed(1)}s`;
      const lastEl = root.getElementById("intercept-timing-last");
      const avgEl = root.getElementById("intercept-timing-avg");
      if (lastEl) lastEl.textContent = fmt(stats?.lastMs);
      if (avgEl) {
        avgEl.textContent = stats?.avgMs != null ? `${fmt(stats.avgMs)} (${stats.count} run${stats.count === 1 ? "" : "s"})` : "\u2013";
      }
    }
    const modelSearchEl = root.getElementById("model-search");
    const modelListEl = root.getElementById("model-list");
    let modelHighlightIdx = -1;
    function modelFamilyOf(id) {
      const p = id.split("-");
      return p.length >= 2 ? `${p[0]} ${p[1]}` : id;
    }
    function renderModelList(query) {
      if (!modelListEl) return;
      const q = query.trim().toLowerCase();
      const opts = Array.from(modelEl.options).filter((o) => o.value && o.value.toLowerCase().includes(q));
      modelHighlightIdx = -1;
      if (opts.length === 0) {
        setSafeHTML(modelListEl, `<div style="padding:8px 10px;color:var(--text-secondary);font-size:11px;">No models match \u201C${esc(query)}\u201D</div>`);
        return;
      }
      const selected = modelEl.value;
      const grouped = q.length === 0;
      let html = "";
      let lastFamily = "";
      for (const o of opts) {
        if (grouped) {
          const fam = modelFamilyOf(o.value);
          if (fam !== lastFamily) {
            html += `<div style="padding:6px 10px 2px;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);position:sticky;top:0;background:var(--bg-glass);">${esc(fam)}</div>`;
            lastFamily = fam;
          }
        }
        const isSel = o.value === selected;
        html += `<div class="model-opt" data-value="${esc(o.value)}" role="option" style="padding:6px 10px;font-size:12px;cursor:pointer;color:var(--text-primary);${isSel ? "background:var(--accent-glow);font-weight:600;" : ""}">${esc(o.value)}</div>`;
      }
      setSafeHTML(modelListEl, html);
    }
    function modelOptItems() {
      return modelListEl ? Array.from(modelListEl.querySelectorAll(".model-opt")) : [];
    }
    function applyModelHighlight() {
      const items = modelOptItems();
      items.forEach((el, i) => {
        el.style.background = i === modelHighlightIdx ? "var(--btn-hover)" : el.dataset.value === modelEl.value ? "var(--accent-glow)" : "";
      });
      const hl = modelHighlightIdx >= 0 ? items[modelHighlightIdx] : void 0;
      if (hl) hl.scrollIntoView({ block: "nearest" });
    }
    function openModelList() {
      if (!modelListEl) return;
      renderModelList(modelSearchEl?.value && modelSearchEl.value !== modelEl.value ? modelSearchEl.value : "");
      modelListEl.style.display = "block";
      const sel = modelOptItems().find((el) => el.dataset.value === modelEl.value);
      if (sel) sel.scrollIntoView({ block: "nearest" });
    }
    function closeModelList() {
      if (modelListEl) modelListEl.style.display = "none";
      if (modelSearchEl) modelSearchEl.value = modelEl.value;
    }
    function selectModel(value) {
      modelEl.value = value;
      if (modelSearchEl) modelSearchEl.value = value;
      if (modelListEl) modelListEl.style.display = "none";
      modelEl.dispatchEvent(new Event("change"));
    }
    if (modelSearchEl && modelListEl) {
      modelSearchEl.addEventListener("focus", () => {
        openModelList();
        modelSearchEl.select();
      });
      modelSearchEl.addEventListener("input", () => {
        renderModelList(modelSearchEl.value);
        modelListEl.style.display = "block";
      });
      modelSearchEl.addEventListener("keydown", (e) => {
        const items = modelOptItems();
        if (e.key === "ArrowDown") {
          e.preventDefault();
          modelHighlightIdx = Math.min(items.length - 1, modelHighlightIdx + 1);
          applyModelHighlight();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          modelHighlightIdx = Math.max(0, modelHighlightIdx - 1);
          applyModelHighlight();
        } else if (e.key === "Enter") {
          e.preventDefault();
          const pick = items[modelHighlightIdx] || items.find((el) => el.dataset.value === modelEl.value) || items[0];
          if (pick?.dataset.value) selectModel(pick.dataset.value);
        } else if (e.key === "Escape") {
          closeModelList();
          modelSearchEl.blur();
        }
      });
      modelListEl.addEventListener("mousedown", (e) => {
        const opt = e.target?.closest(".model-opt");
        if (opt?.dataset.value) {
          e.preventDefault();
          selectModel(opt.dataset.value);
        }
      });
      root.addEventListener("mousedown", (e) => {
        const t = e.target;
        if (modelListEl.style.display === "block" && !t.closest?.("#model-combo")) closeModelList();
      });
    }
    function updateProviderLabels() {
      const prov = provEl.value;
      const gemmaDisclaimerEl = $("gemma-disclaimer");
      if (gemmaDisclaimerEl) {
        gemmaDisclaimerEl.style.display = prov === "gemini" ? "block" : "none";
      }
      if (prov === "openai") {
        keyLblEl.textContent = "OpenAI API key";
        keyEl.placeholder = "sk-...";
      } else if (prov === "gemini") {
        keyLblEl.textContent = "Gemini API key";
        keyEl.placeholder = "AIzaSy...";
      } else if (prov === "ollama") {
        keyLblEl.textContent = "Ollama Host URL";
        keyEl.placeholder = "http://localhost:11434";
      } else {
        keyLblEl.textContent = "Claude API key";
        keyEl.placeholder = "sk-ant-...";
      }
      if (lastState?.settings?.keyStatus?.[prov]) {
        keyEl.placeholder = "\u2022\u2022\u2022\u2022 (key saved)";
        if (document.activeElement !== keyEl) {
          keyEl.value = "";
        }
      } else {
        if (document.activeElement !== keyEl) {
          keyEl.value = "";
        }
      }
    }
    provEl.addEventListener("change", () => {
      updateProviderLabels();
      if (providerChangeCb) {
        providerChangeCb(provEl.value, keyEl.value.trim());
      }
    });
    keyEl.addEventListener("change", () => {
      if (providerChangeCb) {
        providerChangeCb(provEl.value, keyEl.value.trim());
      }
    });
    const box = root.querySelector(".box");
    function updateThemeClass() {
      const val = themeEl.value;
      box.className = "box";
      if (isMinimized) box.classList.add("minimized");
      box.classList.add(`theme-${val}`);
    }
    themeEl.addEventListener("change", () => {
      updateThemeClass();
      if (themeChangeCb) {
        themeChangeCb(themeEl.value);
      }
    });
    const toggle = root.getElementById("min-toggle");
    const contentBody = root.getElementById("content-body");
    let isMinimized = localStorage.getItem("aid-tracker-minimized") === "true";
    function ensureHostInsideViewport() {
      let width = 320;
      let height = 400;
      if (isMinimized) {
        width = 130;
        height = 32;
      } else {
        const sw = localStorage.getItem("aid-tracker-size-width");
        const sh = localStorage.getItem("aid-tracker-size-height");
        if (sw) width = parseInt(sw, 10) || 320;
        if (sh) height = parseInt(sh, 10) || 400;
      }
      const currentLeft = host.offsetLeft;
      const currentTop = host.offsetTop;
      const clampedLeft = Math.min(Math.max(0, currentLeft), window.innerWidth - width);
      const clampedTop = Math.min(Math.max(0, currentTop), window.innerHeight - height);
      host.style.bottom = "auto";
      host.style.left = clampedLeft + "px";
      host.style.top = clampedTop + "px";
      localStorage.setItem("aid-tracker-pos-left", host.style.left);
      localStorage.setItem("aid-tracker-pos-top", host.style.top);
    }
    function updateMinState() {
      const pendingCount = lastState?.versions.filter((v) => v.status === "pending").length ?? 0;
      if (isMinimized) {
        box.classList.add("minimized");
        if (pendingCount > 0) {
          setSafeHTML(toggle, `\uFF0B Story Helper <span class="badge-dot"></span>`);
        } else {
          toggle.textContent = "\uFF0B Story Helper";
        }
        st.style.display = "none";
        contentBody.style.display = "none";
        box.style.width = "";
        box.style.height = "";
      } else {
        box.classList.remove("minimized");
        toggle.textContent = "\u2014";
        st.style.display = "block";
        contentBody.style.display = "flex";
        const sw = localStorage.getItem("aid-tracker-size-width");
        const sh = localStorage.getItem("aid-tracker-size-height");
        if (sw) box.style.width = sw;
        if (sh) box.style.height = sh;
      }
      ensureHostInsideViewport();
    }
    toggle.addEventListener("click", () => {
      isMinimized = !isMinimized;
      localStorage.setItem("aid-tracker-minimized", String(isMinimized));
      updateMinState();
    });
    updateMinState();
    window.addEventListener("resize", ensureHostInsideViewport);
    box.addEventListener("mouseup", () => {
      if (!isMinimized) {
        localStorage.setItem("aid-tracker-size-width", box.style.width);
        localStorage.setItem("aid-tracker-size-height", box.style.height);
      }
    });
    function makeDraggable(el, handle) {
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      handle.onmousedown = dragMouseDown;
      function dragMouseDown(e) {
        if (e.target.closest("button")) return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
      }
      function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        let width = 320;
        let height = 400;
        if (isMinimized) {
          width = 130;
          height = 32;
        } else {
          const sw = localStorage.getItem("aid-tracker-size-width");
          const sh = localStorage.getItem("aid-tracker-size-height");
          if (sw) width = parseInt(sw, 10) || 320;
          if (sh) height = parseInt(sh, 10) || 400;
        }
        let newLeft = el.offsetLeft - pos1;
        let newTop = el.offsetTop - pos2;
        newLeft = Math.min(Math.max(0, newLeft), window.innerWidth - width);
        newTop = Math.min(Math.max(0, newTop), window.innerHeight - height);
        el.style.bottom = "auto";
        el.style.left = newLeft + "px";
        el.style.top = newTop + "px";
        localStorage.setItem("aid-tracker-pos-left", el.style.left);
        localStorage.setItem("aid-tracker-pos-top", el.style.top);
      }
      function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
      }
    }
    makeDraggable(host, $("drag-handle"));
    const viewTracker = root.getElementById("view-tracker");
    const viewSettings = root.getElementById("view-settings");
    const viewAnalyze = root.getElementById("view-analyze");
    const analyzeBody = root.getElementById("analyze-body");
    const toastEl = root.getElementById("toast");
    let toastTimeout = null;
    function showToast(text, isError = false) {
      if (toastTimeout) clearTimeout(toastTimeout);
      toastEl.textContent = text;
      if (isError) {
        toastEl.style.background = "rgba(239, 68, 68, 0.95)";
        toastEl.style.boxShadow = "0 8px 24px rgba(239, 68, 68, 0.3)";
      } else {
        toastEl.style.background = "rgba(16, 185, 129, 0.95)";
        toastEl.style.boxShadow = "0 8px 24px rgba(16, 185, 129, 0.3)";
      }
      toastEl.style.display = "block";
      toastEl.offsetHeight;
      toastEl.style.opacity = "1";
      toastEl.style.transform = "translate(-50%, 0)";
      toastTimeout = setTimeout(() => {
        toastEl.style.opacity = "0";
        toastEl.style.transform = "translate(-50%, -10px)";
        toastTimeout = setTimeout(() => {
          toastEl.style.display = "none";
        }, 300);
      }, 2500);
    }
    const showTrackerView = () => {
      viewTracker.style.display = "flex";
      viewSettings.style.display = "none";
      viewAnalyze.style.display = "none";
    };
    const showSettingsView = () => {
      viewTracker.style.display = "none";
      viewSettings.style.display = "flex";
      viewAnalyze.style.display = "none";
      switchTab("tab-gen");
    };
    const showAnalyzeView = () => {
      viewTracker.style.display = "none";
      viewSettings.style.display = "none";
      viewAnalyze.style.display = "flex";
    };
    const setAnalyzeLoading = () => {
      setSafeHTML(analyzeBody, `<div style="text-align:center;padding:28px 12px;color:var(--text-secondary);"><div class="spinner"></div><div style="margin-top:12px;font-size:12px;font-weight:600;color:var(--text-primary);">Analyzing the story for Plot Essentials updates\u2026</div><div class="note" style="margin-top:6px;">This calls your AI provider, so it can take a bit.</div></div>`);
    };
    root.getElementById("analyze-back").addEventListener("click", showTrackerView);
    let offMetaSections = null;
    async function loadOffMetaRepository() {
      const container = root.getElementById("offmeta-repo-container");
      if (!container) return;
      if (offMetaSections) {
        renderOffMetaRepository();
        return;
      }
      setSafeHTML(container, `
      <div id="offmeta-loading" style="text-align:center; padding:30px; color:var(--text-secondary);">
        <div class="spinner" style="width:16px; height:16px; margin-bottom:6px; border-width:2px;"></div>
        <div>Fetching rules from Google Doc...</div>
      </div>
    `);
      try {
        const res = await browser.runtime.sendMessage({ kind: "getOffMetaRepository" });
        if (res && res.ok && Array.isArray(res.sections)) {
          offMetaSections = res.sections;
          renderOffMetaRepository();
        } else {
          throw new Error(res?.error || "Invalid response");
        }
      } catch (err) {
        setSafeHTML(container, `
        <div style="text-align:center; padding:20px; color:#fca5a5;">
          <div style="font-weight:bold; margin-bottom:4px; font-size:11px;">Failed to load repository</div>
          <div style="font-size:9.5px; margin-bottom:8px;">${esc(err?.message || String(err))}</div>
          <button id="offmeta-retry" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.2); cursor:pointer;">Retry</button>
        </div>
      `);
        root.getElementById("offmeta-retry")?.addEventListener("click", () => {
          loadOffMetaRepository();
        });
      }
    }
    let activeSubTab = "offmeta-subtab-intro";
    function switchSubTab(subTabId) {
      activeSubTab = subTabId;
      const btns = root.querySelectorAll(".offmeta-subtab-btn");
      btns.forEach((b) => {
        const active = b.getAttribute("data-subtab") === subTabId;
        if (active) {
          b.style.color = "var(--theme-text-color)";
          b.style.borderBottomColor = "var(--theme-text-color)";
          b.style.fontWeight = "700";
          b.classList.add("active");
        } else {
          b.style.color = "var(--text-secondary)";
          b.style.borderBottomColor = "transparent";
          b.style.fontWeight = "normal";
          b.classList.remove("active");
        }
      });
      const statusEl = root.getElementById("offmeta-status");
      if (statusEl) statusEl.style.display = "none";
      renderOffMetaRepository();
    }
    function renderOffMetaRepository() {
      const container = root.getElementById("offmeta-repo-container");
      const searchContainer = root.getElementById("offmeta-search-container");
      if (!container || !offMetaSections) return;
      if (activeSubTab === "offmeta-subtab-intro") {
        if (searchContainer) searchContainer.style.display = "none";
        setSafeHTML(container, `
        <div style="font-size:11.5px; line-height:1.45; color:var(--text-primary); display:flex; flex-direction:column; gap:8px; padding:4px;">
          <div style="background:rgba(52,211,153,0.05); border:1px solid rgba(52,211,153,0.15); border-radius:6px; padding:8px 10px; margin-bottom:4px;">
            <span style="font-weight:700; color:var(--theme-text-color); font-size:12.5px;">Thank You</span>
            <p style="margin:4px 0 0 0; color:var(--text-primary);">A huge thank you to <strong>OffMetaGamer</strong> for graciously allowing this repository to be integrated directly into the AID Story Helper extension!</p>
          </div>
          
          <div style="border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; background:rgba(255,255,255,0.01);">
            <div style="font-weight:700; color:var(--theme-text-color); font-size:12px; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.03em;">Note from OffMetaGamer:</div>
            <div style="font-style:italic; margin-bottom:8px; border-left:2px solid var(--theme-text-color); padding-left:8px; color:var(--text-secondary); font-size:11px;">
              "Special thanks to shiny, Leshok, Hawk, Dirty Kurtis, little hat, SeinSchatten, Zoocata, Aederia, hrafnsnorn, dragonxsx, and all of the other amazing AIN pioneers pushing the boundaries of what AI can do!"
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
              <div>
                \u2665\uFE0FPlease keep in mind that I do this as a hobby, it is not my job\u2665\uFE0F
              </div>
              <div>
                This resource assumes that you have at least a basic understanding of Plot Components. If you do not understand the basics of AI Instructions, Plot Essentials, Author\u2019s Note, and Placeholders, you may want to first read the <a href="https://help.aidungeon.com/new-player-guide" target="_blank" style="color:var(--theme-text-color); font-weight:bold; text-decoration:underline;">New Player Guide</a> before attempting to utilize this resource. The primary goal is to offer a somewhat organized selection of tried and true AIN/AN that can solve almost any problem that you might run into. Any circumstance under which multiple options are provided with similar purposes indicates that it is worded for specific models or a slightly different effect. Test them until you find one that works well for the model you are using and your specific circumstances. DO NOT take everything in this document and put it into AIN all at once, it will both eat up an absurd amount of tokens and probably also produce terrible results. Instead, pick and choose lines that solve problems you are experiencing or use the sets provided to have a prebuilt experience.
              </div>
              <div style="margin-top:4px; border-top:1px solid var(--border-color); padding-top:8px; display:flex; flex-direction:column; gap:8px;">
                <div style="background:rgba(52,211,153,0.05); border:1px solid rgba(52,211,153,0.15); border-radius:6px; padding:8px 10px; color:var(--text-primary); font-size:11px; line-height:1.4;">
                  Anything that includes <code>\${character.name}</code> is a Placeholder for Scenario creation. In this extension, we dynamically replace <code>\${character.name}</code> with <code>{protagonist}</code> when applying instructions. If you are adding any line with placeholders manually, make sure to replace the placeholder with the relevant information. <code>\${character.name}</code> becomes Dave.
                </div>
                <div style="color:var(--text-secondary); font-size:11px; padding-left:4px;">
                  - <code>[ ]</code> and <code>{ }</code> are used to cluster information. This helps the AI keep track of information that is related to each other better, especially when formatting is otherwise ambiguous.
                </div>
              </div>
            </div>
          </div>
        </div>
      `);
        return;
      }
      if (searchContainer) searchContainer.style.display = "flex";
      const query = root.getElementById("offmeta-search")?.value?.trim().toLowerCase() || "";
      let html = "";
      for (const sec of offMetaSections) {
        if (activeSubTab === "offmeta-subtab-premade" && sec.title !== "\u{1F916} Premade AIN") continue;
        if (activeSubTab === "offmeta-subtab-anpe" && sec.title !== "\u{1F916} AN/PE") continue;
        if (activeSubTab === "offmeta-subtab-individual" && (sec.title === "\u{1F916} Premade AIN" || sec.title === "\u{1F916} AN/PE")) continue;
        let sectionHtml = "";
        let matchesSection = false;
        for (const group of sec.groups) {
          let groupHtml = "";
          let groupItemsFiltered = [];
          for (const item of group.items) {
            const contentMatch = item.content.toLowerCase().includes(query);
            const titleMatch = item.title && item.title.toLowerCase().includes(query);
            const sectionMatch = sec.title.toLowerCase().includes(query);
            const groupMatch = group.name && group.name.toLowerCase().includes(query);
            if (!query || contentMatch || titleMatch || sectionMatch || groupMatch) {
              groupItemsFiltered.push(item);
            }
          }
          if (groupItemsFiltered.length > 0) {
            if (group.name) {
              groupHtml += `<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin:8px 0 4px 4px;text-transform:uppercase;letter-spacing:0.02em;">${esc(group.name)}</div>`;
            }
            groupHtml += `<div style="display:flex;flex-direction:column;gap:6px;">`;
            for (const item of groupItemsFiltered) {
              const isBlock = item.type === "block";
              const displayTitle = item.title || (isBlock ? "Preset Block" : "Instruction");
              groupHtml += `
              <div class="offmeta-item-card" data-id="${item.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;transition:all 0.2s ease;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
                  <span style="font-weight:600;font-size:11.5px;color:var(--theme-text-color);">${esc(displayTitle)}</span>
                  <div style="display:flex;gap:4px;align-items:center;">
                    <button class="offmeta-copy-btn" data-content="${esc(item.content)}" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(255,255,255,0.04);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;" title="Copy to clipboard">Copy</button>
            `;
              if (sec.title === "\u{1F916} AN/PE") {
                groupHtml += `
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="an" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply to AN</button>
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="pe" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply to PE</button>
              `;
              } else if (sec.title === "\u{1F916} Premade AIN") {
                groupHtml += `
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="ain" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply AIN</button>
              `;
              } else {
                groupHtml += `
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="ain" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply AIN</button>
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="an" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply to AN</button>
              `;
              }
              groupHtml += `
                  </div>
                </div>
            `;
              if (isBlock) {
                groupHtml += `
                <details style="margin:0;border:none;background:none;padding:0;">
                  <summary style="cursor:pointer;font-size:10.5px;color:var(--text-secondary);padding:2px 0;outline:none;list-style:none;">
                    <span style="border-bottom:1px dashed var(--text-secondary);">Click to preview (${item.content.split("\n").length} lines)</span>
                  </summary>
                  <pre style="margin:4px 0 0 0;font-family:SFMono-Regular,Consolas,monospace;font-size:10px;background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;color:var(--text-primary);max-height:120px;overflow-y:auto;border:1px solid rgba(255,255,255,0.02);">${esc(item.content)}</pre>
                </details>
              `;
              } else {
                groupHtml += `
                <div style="font-size:11px;color:var(--text-primary);line-height:1.35;word-break:break-word;">${esc(item.content)}</div>
              `;
              }
              groupHtml += `</div>`;
            }
            groupHtml += `</div>`;
            sectionHtml += groupHtml;
            matchesSection = true;
          }
        }
        if (matchesSection) {
          const showSecHeader = activeSubTab === "offmeta-subtab-individual";
          html += `
          <div class="offmeta-section-card" style="border-bottom:1px solid var(--border-color);padding-bottom:10px;margin-bottom:6px;">
            ${showSecHeader ? `<div style="font-size:12px;font-weight:700;color:var(--theme-text-color);margin:6px 0;text-transform:uppercase;letter-spacing:0.03em;">${esc(sec.title)}</div>` : ""}
            ${sectionHtml}
          </div>
        `;
        }
      }
      if (!html) {
        html = `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:11.5px;">No matching instructions found.</div>`;
      }
      setSafeHTML(container, html);
      container.querySelectorAll(".offmeta-copy-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const target = e.currentTarget;
          const content = target.getAttribute("data-content") || "";
          navigator.clipboard.writeText(content).then(() => {
            const oldText = target.textContent;
            target.textContent = "Copied!";
            setTimeout(() => {
              target.textContent = oldText;
            }, 1500);
          }).catch((err) => {
            console.error("Clipboard copy failed:", err);
          });
        });
      });
      container.querySelectorAll(".offmeta-apply-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const target = e.currentTarget;
          const id = target.getAttribute("data-id") || "";
          const type = target.getAttribute("data-type") || "";
          let foundItem = null;
          for (const sec of offMetaSections) {
            for (const group of sec.groups) {
              const match = group.items.find((it) => it.id === id);
              if (match) {
                foundItem = match;
                break;
              }
            }
            if (foundItem) break;
          }
          if (!foundItem) return;
          const oldText = target.textContent;
          target.textContent = "Applying...";
          target.disabled = true;
          const statusEl = root.getElementById("offmeta-status");
          if (statusEl) {
            statusEl.style.display = "none";
          }
          try {
            const sid = lastState?.shortId;
            if (!sid) throw new Error("No active adventure loaded.");
            const res = await browser.runtime.sendMessage({
              kind: "applyOffMetaInstruction",
              shortId: sid,
              text: foundItem.content,
              type,
              itemType: foundItem.type
            });
            if (res && res.ok) {
              target.textContent = "Applied!";
              if (statusEl) {
                statusEl.textContent = res.message || "Successfully applied instruction!";
                statusEl.style.background = "rgba(16,185,129,0.1)";
                statusEl.style.color = "#34d399";
                statusEl.style.display = "block";
              }
              if (applyInstructionCb) applyInstructionCb();
            } else {
              throw new Error(res?.error || "Save rejected by background service worker.");
            }
          } catch (err) {
            target.textContent = "Failed";
            if (statusEl) {
              statusEl.textContent = err?.message || String(err);
              statusEl.style.background = "rgba(239,68,68,0.1)";
              statusEl.style.color = "#fca5a5";
              statusEl.style.display = "block";
            }
          } finally {
            setTimeout(() => {
              target.textContent = oldText;
              target.disabled = false;
            }, 3e3);
          }
        });
      });
    }
    function switchTab(tabId) {
      const panes = root.querySelectorAll(".tab-pane");
      const btns = root.querySelectorAll(".tab-btn");
      panes.forEach((p) => {
        if (p.id === tabId) {
          p.style.display = p.id === "tab-offmeta" || p.id === "tab-manager" ? "flex" : "block";
        } else {
          p.style.display = "none";
        }
      });
      btns.forEach((b) => {
        if (b.getAttribute("data-tab") === tabId) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
      if (tabId === "tab-offmeta") {
        loadOffMetaRepository();
      }
      if (tabId === "tab-manager" && lastState) {
        renderAdventuresManager(lastState);
      }
    }
    root.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        if (tabId) switchTab(tabId);
      });
    });
    let activeManagerSubtab = "global";
    function switchManagerSubtab(subtab) {
      activeManagerSubtab = subtab;
      const globalPane = root.getElementById("subpane-global");
      const explorerPane = root.getElementById("subpane-explorer");
      const btnGlobal = root.getElementById("btn-subtab-global");
      const btnExplorer = root.getElementById("btn-subtab-explorer");
      if (globalPane && explorerPane && btnGlobal && btnExplorer) {
        if (subtab === "global") {
          globalPane.style.display = "flex";
          explorerPane.style.display = "none";
          btnGlobal.style.color = "var(--theme-text-color)";
          btnGlobal.style.borderBottom = "2px solid var(--theme-text-color)";
          btnGlobal.style.fontWeight = "700";
          btnExplorer.style.color = "var(--text-secondary)";
          btnExplorer.style.borderBottom = "2px solid transparent";
          btnExplorer.style.fontWeight = "normal";
        } else {
          globalPane.style.display = "none";
          explorerPane.style.display = "flex";
          btnExplorer.style.color = "var(--theme-text-color)";
          btnExplorer.style.borderBottom = "2px solid var(--theme-text-color)";
          btnExplorer.style.fontWeight = "700";
          btnGlobal.style.color = "var(--text-secondary)";
          btnGlobal.style.borderBottom = "2px solid transparent";
          btnGlobal.style.fontWeight = "normal";
        }
      }
      if (lastState) {
        renderAdventuresManager(lastState);
      }
    }
    root.getElementById("btn-subtab-global")?.addEventListener("click", () => switchManagerSubtab("global"));
    root.getElementById("btn-subtab-explorer")?.addEventListener("click", () => switchManagerSubtab("explorer"));
    root.getElementById("btn-view-hidden-adv")?.addEventListener("click", async () => {
      try {
        const res = await browser.runtime.sendMessage({ kind: "getHiddenAdventures" });
        if (res?.error) {
          showToast(`Error: ${res.error}`, true);
        } else {
          showHiddenAdventuresModal(res.adventures || []);
        }
      } catch (err) {
        showToast(`Error: ${err?.message || err}`, true);
      }
    });
    root.getElementById("btn-show-add-global")?.addEventListener("click", () => {
      const form = root.getElementById("form-add-global");
      const btn = root.getElementById("btn-show-add-global");
      if (form && btn) {
        form.style.display = "flex";
        btn.style.display = "none";
      }
    });
    root.getElementById("btn-cancel-global")?.addEventListener("click", () => {
      const form = root.getElementById("form-add-global");
      const btn = root.getElementById("btn-show-add-global");
      if (form && btn) {
        form.style.display = "none";
        btn.style.display = "block";
        resetAddGlobalForm();
      }
    });
    root.getElementById("global-type")?.addEventListener("change", (e) => {
      const type = e.target.value;
      const scFields = root.getElementById("sc-fields");
      if (scFields) {
        scFields.style.display = type === "sc" ? "flex" : "none";
      }
    });
    root.getElementById("btn-save-global")?.addEventListener("click", async () => {
      const type = root.getElementById("global-type").value;
      const title = root.getElementById("global-title").value.trim();
      const value = root.getElementById("global-value").value.trim();
      if (!title || !value) {
        showToast("Title and Content value are required.", true);
        return;
      }
      const asset = {
        id: Math.floor(Math.random() * 1e9).toString() + "-" + Date.now(),
        type,
        title,
        value,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (type === "sc") {
        const scType = root.getElementById("global-sc-type").value;
        const keys = root.getElementById("global-keys").value.trim();
        const description = root.getElementById("global-description").value.trim();
        asset.keys = keys || void 0;
        asset.description = description || void 0;
        asset.cardType = scType;
      }
      if (saveGlobalAssetCb) {
        const btn = root.getElementById("btn-save-global");
        const oldText = btn.textContent;
        btn.textContent = "Creating...";
        btn.disabled = true;
        try {
          const res = await saveGlobalAssetCb(asset);
          if (res?.error) {
            showToast(`Failed to create: ${res.error}`, true);
          } else {
            showToast(`Created global asset '${title}'!`);
            const form = root.getElementById("form-add-global");
            const showBtn = root.getElementById("btn-show-add-global");
            if (form && showBtn) {
              form.style.display = "none";
              showBtn.style.display = "block";
            }
            resetAddGlobalForm();
            triggerRefresh();
          }
        } catch (err) {
          showToast(`Error: ${err?.message || err}`, true);
        } finally {
          btn.textContent = oldText;
          btn.disabled = false;
        }
      }
    });
    function showAdventureDeleteModal(shortId, advTitle) {
      const box2 = root.querySelector(".box");
      if (!box2) return;
      root.getElementById("adv-delete-modal")?.remove();
      const modal = document.createElement("div");
      modal.id = "adv-delete-modal";
      modal.style.cssText = `
        position:absolute;
        top:0;
        left:0;
        right:0;
        bottom:0;
        background:rgba(18,18,22,0.92);
        z-index:10000;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        padding:16px;
        box-sizing:border-box;
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      `;
      setSafeHTML(modal, `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:16px;width:100%;max-width:280px;box-sizing:border-box;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);">
          <div style="font-weight:700;font-size:12.5px;color:var(--text-primary);text-align:center;">Delete Adventure Data?</div>
          <div style="font-size:11px;color:var(--text-secondary);text-align:center;line-height:1.4;word-break:break-all;">"${esc(advTitle)}"<br/><span style="color:var(--text-secondary);font-size:10px;opacity:0.8;">(${esc(shortId)})</span></div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
            <button id="modal-remove-view" style="width:100%;padding:6px;font-size:11px;margin:0;">Remove from view</button>
            <button id="modal-delete-all" style="width:100%;padding:6px;font-size:11px;margin:0;background:rgba(239,68,68,0.15);color:#fca5a5;border-color:rgba(239,68,68,0.25);font-weight:600;">Delete all adventure data</button>
            <button id="modal-cancel" style="width:100%;padding:6px;font-size:11px;margin:0;background:none;border:none;color:var(--text-secondary);">Cancel</button>
          </div>
        </div>
      `);
      box2.appendChild(modal);
      modal.querySelector("#modal-cancel")?.addEventListener("click", () => {
        modal.remove();
      });
      modal.querySelector("#modal-remove-view")?.addEventListener("click", async () => {
        try {
          const res = await browser.runtime.sendMessage({ kind: "hideAdventure", shortId });
          if (res?.error) {
            showToast(`Error: ${res.error}`, true);
          } else {
            showToast("Adventure removed from view.");
            triggerRefresh();
          }
        } catch (err) {
          showToast(`Error: ${err?.message || err}`, true);
        } finally {
          modal.remove();
        }
      });
      modal.querySelector("#modal-delete-all")?.addEventListener("click", async () => {
        try {
          const res = await browser.runtime.sendMessage({ kind: "deleteAdventure", shortId });
          if (res?.error) {
            showToast(`Error: ${res.error}`, true);
          } else {
            showToast("All adventure data deleted.");
            triggerRefresh();
          }
        } catch (err) {
          showToast(`Error: ${err?.message || err}`, true);
        } finally {
          modal.remove();
        }
      });
    }
    function showHiddenAdventuresModal(hiddenAdventures) {
      const box2 = root.querySelector(".box");
      if (!box2) return;
      root.getElementById("hidden-adv-modal")?.remove();
      const modal = document.createElement("div");
      modal.id = "hidden-adv-modal";
      modal.style.cssText = `
        position:absolute;
        top:0;
        left:0;
        right:0;
        bottom:0;
        background:rgba(18,18,22,0.92);
        z-index:10000;
        display:flex;
        flex-direction:column;
        padding:16px;
        box-sizing:border-box;
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      `;
      let listHtml = "";
      if (hiddenAdventures.length === 0) {
        listHtml = `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No hidden adventures found.</div>`;
      } else {
        listHtml = hiddenAdventures.map((adv) => `
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;padding:6px 8px;margin-bottom:6px;gap:6px;box-sizing:border-box;width:100%;">
            <div style="display:flex;flex-direction:column;min-width:0;flex:1;text-align:left;">
              <span style="font-weight:600;font-size:11px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;" title="${esc(adv.title || "Untitled Adventure")}">${esc(adv.title || "Untitled Adventure")}</span>
              <span style="font-size:9.5px;color:var(--text-secondary);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">(${esc(adv.shortId)})</span>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              <button class="btn-restore-adv" data-shortid="${adv.shortId}" style="margin:0;padding:2px 6px;font-size:9.5px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Restore</button>
              <button class="btn-purge-adv" data-shortid="${adv.shortId}" data-title="${esc(adv.title || "Untitled Adventure")}" style="margin:0;padding:2px 6px;font-size:9.5px;background:rgba(239,68,68,0.1);color:#fca5a5;border:1px solid rgba(239,68,68,0.2);border-radius:4px;cursor:pointer;">Delete</button>
            </div>
          </div>
        `).join("");
      }
      setSafeHTML(modal, `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:16px;width:100%;height:100%;max-height:100%;box-sizing:border-box;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);overflow:hidden;">
          <div style="font-weight:700;font-size:12.5px;color:var(--text-primary);text-align:center;flex-shrink:0;">Hidden Adventures</div>
          <div style="flex:1;overflow-y:auto;min-height:0;padding-right:4px;">
            ${listHtml}
          </div>
          <div style="display:flex;justify-content:center;margin-top:4px;flex-shrink:0;">
            <button id="modal-close-hidden" style="width:100%;padding:6px;font-size:11px;margin:0;">Close</button>
          </div>
        </div>
      `);
      box2.appendChild(modal);
      modal.querySelector("#modal-close-hidden")?.addEventListener("click", () => {
        modal.remove();
      });
      modal.querySelectorAll(".btn-restore-adv").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const shortId = btn.getAttribute("data-shortid") || "";
          if (!shortId) return;
          try {
            const res = await browser.runtime.sendMessage({ kind: "unhideAdventure", shortId });
            if (res?.error) {
              showToast(`Error: ${res.error}`, true);
            } else {
              showToast("Adventure restored to view.");
              triggerRefresh();
              modal.remove();
            }
          } catch (err) {
            showToast(`Error: ${err?.message || err}`, true);
          }
        });
      });
      modal.querySelectorAll(".btn-purge-adv").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const shortId = btn.getAttribute("data-shortid") || "";
          const advTitle = btn.getAttribute("data-title") || "Untitled Adventure";
          if (!shortId) return;
          showAdventureDeleteModal(shortId, advTitle);
          modal.remove();
        });
      });
    }
    function renderAdventuresManager(state) {
      const listGlobal = root.getElementById("global-assets-list");
      const listExplorer = root.getElementById("db-explorer-list");
      if (!listGlobal || !listExplorer) return;
      const globalAssets = state.globalAssets || [];
      if (globalAssets.length === 0) {
        setSafeHTML(listGlobal, `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No global assets stored yet. Add some below or favorite them from local adventures!</div>`);
      } else {
        const groups = { ain: [], an: [], pe: [], sc: [] };
        for (const a of globalAssets) {
          const group = groups[a.type];
          if (group) group.push(a);
        }
        const typeTitles = {
          ain: "AI Instructions (AIN)",
          an: "Author's Notes (AN)",
          pe: "Character Descriptions (PE)",
          sc: "Story Cards (SC)"
        };
        let html = "";
        for (const [type, items] of Object.entries(groups)) {
          if (items.length === 0) continue;
          html += `<div style="margin-top:8px;"><div style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--theme-text-color);letter-spacing:0.05em;margin-bottom:4px;">${typeTitles[type]}</div><div style="display:flex;flex-direction:column;gap:6px;">`;
          for (const item of items) {
            const escVal = esc(item.value);
            const isSc = item.type === "sc";
            const scMeta = isSc ? `<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;"><strong>Keys:</strong> ${esc(item.keys || "")}</div>` : "";
            html += `
            <div class="global-asset-card" data-id="${item.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;padding:8px;box-sizing:border-box;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
                <div style="font-weight:600;font-size:11.5px;color:var(--text-primary);word-break:break-all;">${esc(item.title)}</div>
                <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                  ${!state.isManagerOnly ? `<button class="btn-import-asset" style="margin:0;padding:2px 6px;font-size:9.5px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Import</button>` : ""}
                  <button class="btn-edit-asset" style="margin:0;padding:2px 6px;font-size:9.5px;background:rgba(59,130,246,0.1);color:#60a5fa;border:1px solid rgba(59,130,246,0.2);border-radius:4px;cursor:pointer;">Edit</button>
                  <button class="btn-delete-asset" style="margin:0;padding:2px 6px;font-size:9.5px;background:rgba(239,68,68,0.1);color:#fca5a5;border:1px solid rgba(239,68,68,0.2);border-radius:4px;cursor:pointer;">Remove From Favorites</button>
                </div>
              </div>
              ${scMeta}
              <details style="cursor:pointer;">
                <summary style="font-size:10.5px;color:var(--text-secondary);list-style:none;">Show value</summary>
                <div style="margin-top:4px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;font-size:10.5px;color:var(--text-primary);white-space:pre-wrap;word-break:break-all;font-family:SFMono-Regular,Consolas,monospace;cursor:text;" class="selectable-text">${escVal}</div>
              </details>
            </div>
          `;
          }
          html += `</div></div>`;
        }
        setSafeHTML(listGlobal, html);
        listGlobal.querySelectorAll(".btn-import-asset").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const card = btn.closest(".global-asset-card");
            const assetId = card?.getAttribute("data-id") || "";
            if (assetId && state.shortId && importGlobalAssetCb) {
              btn.textContent = "Importing...";
              const res = await importGlobalAssetCb(assetId);
              if (res?.error) {
                showToast(`Import failed: ${res.error}`, true);
                btn.textContent = "Import";
              } else {
                showToast(res?.message || "Successfully imported asset!");
                btn.textContent = "Imported";
                setTimeout(() => {
                  btn.textContent = "Import";
                }, 2e3);
              }
            }
          });
        });
        listGlobal.querySelectorAll(".btn-delete-asset").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const card = btn.closest(".global-asset-card");
            const assetId = card?.getAttribute("data-id") || "";
            if (assetId && deleteGlobalAssetCb) {
              if (confirm("Are you sure you want to remove this global asset from your favorites?")) {
                const res = await deleteGlobalAssetCb(assetId);
                if (res?.error) {
                  showToast(`Remove failed: ${res.error}`, true);
                } else {
                  showToast("Removed from favorites.");
                  triggerRefresh();
                }
              }
            }
          });
        });
        listGlobal.querySelectorAll(".btn-edit-asset").forEach((btn) => {
          btn.addEventListener("click", () => {
            const card = btn.closest(".global-asset-card");
            const assetId = card?.getAttribute("data-id") || "";
            if (!assetId) return;
            const asset = globalAssets.find((a) => a.id === assetId);
            if (!asset) return;
            const isSc = asset.type === "sc";
            setSafeHTML(card, `
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-secondary);">Edit Asset</div>
              
              <label style="font-size:9.5px;font-weight:600;margin:0;">Title</label>
              <input class="edit-asset-title" type="text" value="${esc(asset.title)}" style="margin:0;padding:4px;font-size:11px;background:rgba(0,0,0,0.3);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;" />
              
              ${isSc ? `
                <label style="font-size:9.5px;font-weight:600;margin:0;">Keys</label>
                <input class="edit-asset-keys" type="text" value="${esc(asset.keys || "")}" style="margin:0;padding:4px;font-size:11px;background:rgba(0,0,0,0.3);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;" />
                
                <label style="font-size:9.5px;font-weight:600;margin:0;">Description</label>
                <input class="edit-asset-desc" type="text" value="${esc(asset.description || "")}" style="margin:0;padding:4px;font-size:11px;background:rgba(0,0,0,0.3);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;" />
              ` : ""}
              
              <label style="font-size:9.5px;font-weight:600;margin:0;">Value</label>
              <textarea class="edit-asset-value" rows="6" style="margin:0;padding:4px;font-size:11px;background:rgba(0,0,0,0.3);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;font-family:SFMono-Regular,Consolas,monospace;resize:vertical;">${esc(asset.value)}</textarea>
              
              <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:4px;">
                <button class="btn-save-edit" style="margin:0;padding:2px 8px;font-size:10px;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:4px;cursor:pointer;">Save</button>
                <button class="btn-cancel-edit" style="margin:0;padding:2px 8px;font-size:10px;background:rgba(255,255,255,0.05);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">Cancel</button>
              </div>
            </div>
          `);
            card.querySelector(".btn-cancel-edit")?.addEventListener("click", () => {
              triggerRefresh();
            });
            card.querySelector(".btn-save-edit")?.addEventListener("click", async () => {
              const titleInput = card.querySelector(".edit-asset-title");
              const valueTextarea = card.querySelector(".edit-asset-value");
              const keysInput = card.querySelector(".edit-asset-keys");
              const descInput = card.querySelector(".edit-asset-desc");
              if (saveGlobalAssetCb) {
                const updatedAsset = {
                  ...asset,
                  title: titleInput.value,
                  value: valueTextarea.value,
                  keys: keysInput ? keysInput.value : asset.keys,
                  description: descInput ? descInput.value : asset.description
                };
                const res = await saveGlobalAssetCb(updatedAsset);
                if (res?.error) {
                  showToast(`Save failed: ${res.error}`, true);
                } else {
                  showToast("Global asset updated.");
                  triggerRefresh();
                }
              }
            });
          });
        });
      }
      const adventures = state.adventures || [];
      const allCards = state.isManagerOnly ? state.cards || [] : state.allCards || [];
      if (adventures.length === 0) {
        setSafeHTML(listExplorer, `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No saved adventures found in the database.</div>`);
      } else {
        let explorerHtml = "";
        for (const adv of adventures) {
          const advCards = allCards.filter((c) => c.shortId === adv.shortId && !c.deletedAt);
          const plotBlocks = parsePlotEssentials(adv.memory || "");
          let assetsCount = 0;
          if (adv.instructions) assetsCount++;
          if (adv.authorsNote) assetsCount++;
          assetsCount += plotBlocks.length;
          assetsCount += advCards.length;
          explorerHtml += `
          <details class="adv-explorer-card" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px;box-sizing:border-box;" data-shortid="${adv.shortId}">
            <summary style="padding:8px;font-weight:600;font-size:11.5px;color:var(--text-primary);cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;">
              <span style="flex:1;word-break:break-all;font-size:11.5px;text-align:left;">\u{1F4C1} ${esc(adv.title || "Untitled Adventure")} <span style="font-weight:normal;font-size:9.5px;color:var(--text-secondary);">(${esc(adv.shortId)})</span></span>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <span style="font-size:9.5px;background:var(--btn-bg);padding:2px 6px;border-radius:4px;color:var(--text-secondary);">${assetsCount} assets</span>
                <button class="btn-delete-adv" data-shortid="${adv.shortId}" data-title="${esc(adv.title || "Untitled Adventure")}" style="margin:0;padding:2px 6px;font-size:9.5px;background:rgba(239,68,68,0.1);color:#fca5a5;border:1px solid rgba(239,68,68,0.2);border-radius:4px;cursor:pointer;">Remove from...</button>
              </div>
            </summary>
            <div style="padding:0 8px 8px 8px;border-top:1px solid var(--border-color);margin-top:4px;display:flex;flex-direction:column;gap:8px;">
              ${adv.instructions ? `
                <details class="local-category-details" style="margin-top:6px;cursor:pointer;">
                  <summary style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-secondary);list-style:none;outline:none;user-select:none;display:flex;justify-content:space-between;align-items:center;">
                    <span>\u2699\uFE0F AI Instructions</span>
                    <span class="toggle-indicator" style="font-size:9px;color:var(--text-muted);font-weight:normal;"></span>
                  </summary>
                  <div class="local-asset-row" style="margin-top:4px;background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;cursor:default;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="font-size:10px;color:var(--text-secondary);">Instruction Content</span>
                      <button class="btn-favorite-local" data-type="ain" data-title="AIN from ${esc(adv.title || "Adventure")}" data-value="${esc(adv.instructions)}" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:2px;font-size:14px;" title="Favorite to Global Bucket">\u2606</button>
                    </div>
                    <div style="font-size:10.5px;color:var(--text-primary);font-family:SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:120px;overflow-y:auto;word-break:break-all;margin-top:2px;" class="selectable-text">${esc(adv.instructions)}</div>
                  </div>
                </details>
              ` : ""}
              
              ${adv.authorsNote ? `
                <details class="local-category-details" style="margin-top:4px;cursor:pointer;">
                  <summary style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-secondary);list-style:none;outline:none;user-select:none;display:flex;justify-content:space-between;align-items:center;">
                    <span>\u{1F4DD} Author's Note</span>
                    <span class="toggle-indicator" style="font-size:9px;color:var(--text-muted);font-weight:normal;"></span>
                  </summary>
                  <div class="local-asset-row" style="margin-top:4px;background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;cursor:default;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="font-size:10px;color:var(--text-secondary);">Author's Note Content</span>
                      <button class="btn-favorite-local" data-type="an" data-title="AN from ${esc(adv.title || "Adventure")}" data-value="${esc(adv.authorsNote)}" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:2px;font-size:14px;" title="Favorite to Global Bucket">\u2606</button>
                    </div>
                    <div style="font-size:10.5px;color:var(--text-primary);font-family:SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:120px;overflow-y:auto;word-break:break-all;margin-top:2px;" class="selectable-text">${esc(adv.authorsNote)}</div>
                  </div>
                </details>
              ` : ""}

              ${plotBlocks.length > 0 ? `
                <details class="local-category-details" style="margin-top:4px;cursor:pointer;">
                  <summary style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-secondary);list-style:none;outline:none;user-select:none;display:flex;justify-content:space-between;align-items:center;">
                    <span>\u{1F465} Characters (${plotBlocks.length})</span>
                    <span class="toggle-indicator" style="font-size:9px;color:var(--text-muted);font-weight:normal;"></span>
                  </summary>
                  <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;cursor:default;">
                    ${plotBlocks.map((b) => `
                      <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                          <span style="font-weight:600;font-size:11px;color:var(--text-primary);">${esc(b.name)}</span>
                          <button class="btn-favorite-local" data-type="pe" data-title="${esc(b.name)}" data-value="${esc(b.text)}" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:2px;font-size:14px;" title="Favorite to Global Bucket">\u2606</button>
                        </div>
                        <details style="cursor:pointer;margin-top:2px;">
                          <summary style="font-size:10px;color:var(--text-secondary);list-style:none;outline:none;user-select:none;">Show description...</summary>
                          <div style="font-size:10.5px;color:var(--text-secondary);white-space:pre-wrap;margin-top:2px;cursor:text;" class="selectable-text">${esc(b.text)}</div>
                        </details>
                      </div>
                    `).join("")}
                  </div>
                </details>
              ` : ""}

              ${advCards.length > 0 ? `
                <details class="local-category-details" style="margin-top:4px;cursor:pointer;">
                  <summary style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-secondary);list-style:none;outline:none;user-select:none;display:flex;justify-content:space-between;align-items:center;">
                    <span>\u{1F5C2}\uFE0F Story Cards (${advCards.length})</span>
                    <span class="toggle-indicator" style="font-size:9px;color:var(--text-muted);font-weight:normal;"></span>
                  </summary>
                  <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;cursor:default;">
                    ${advCards.map((c) => `
                      <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                          <span style="font-weight:600;font-size:11px;color:var(--text-primary);">${esc(c.title || c.keys || "Untitled")} <span style="font-weight:normal;font-size:9.5px;color:var(--text-secondary);">(${esc(c.type)})</span></span>
                          <button class="btn-favorite-local" data-type="sc" data-title="${esc(c.title || "")}" data-keys="${esc(c.keys || "")}" data-value="${esc(c.value)}" data-description="${esc(c.description || "")}" data-cardtype="${esc(c.type)}" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:2px;font-size:14px;" title="Favorite to Global Bucket">\u2606</button>
                        </div>
                        <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;"><strong>Keys:</strong> ${esc(c.keys || "")}</div>
                        <details style="cursor:pointer;margin-top:2px;">
                          <summary style="font-size:10px;color:var(--text-secondary);list-style:none;outline:none;user-select:none;">Show entry...</summary>
                          <div style="font-size:10.5px;color:var(--text-secondary);white-space:pre-wrap;margin-top:2px;cursor:text;" class="selectable-text">${esc(c.value)}</div>
                          ${c.description ? `<div style="font-size:9.5px;color:var(--text-muted);border-top:1px solid rgba(255,255,255,0.05);margin-top:4px;padding-top:4px;cursor:text;" class="selectable-text">${esc(c.description)}</div>` : ""}
                        </details>
                      </div>
                    `).join("")}
                  </div>
                </details>
              ` : ""}
            </div>
          </details>
        `;
        }
        setSafeHTML(listExplorer, explorerHtml);
        listExplorer.querySelectorAll(".btn-favorite-local").forEach((el) => {
          const btn = el;
          btn.addEventListener("click", async () => {
            const type = btn.getAttribute("data-type") || "";
            const title = btn.getAttribute("data-title") || "";
            const keys = btn.getAttribute("data-keys") || "";
            const value = btn.getAttribute("data-value") || "";
            const description = btn.getAttribute("data-description") || "";
            const cardType = btn.getAttribute("data-cardtype") || "";
            if (saveGlobalAssetCb) {
              btn.textContent = "\u2605";
              btn.style.color = "var(--theme-text-color)";
              const asset = {
                id: Math.floor(Math.random() * 1e9).toString() + "-" + Date.now(),
                type,
                title,
                keys: keys || void 0,
                value,
                description: description || void 0,
                createdAt: (/* @__PURE__ */ new Date()).toISOString(),
                cardType: cardType || void 0
              };
              const res = await saveGlobalAssetCb(asset);
              if (res?.error) {
                showToast(`Failed to favorite: ${res.error}`, true);
                btn.textContent = "\u2606";
                btn.style.color = "var(--text-secondary)";
              } else {
                showToast(`Added '${title}' to Global Bucket!`);
                triggerRefresh();
              }
            }
          });
        });
        listExplorer.querySelectorAll(".btn-delete-adv").forEach((el) => {
          const btn = el;
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const shortId = btn.getAttribute("data-shortid") || "";
            const advTitle = btn.getAttribute("data-title") || "Untitled Adventure";
            if (shortId) {
              showAdventureDeleteModal(shortId, advTitle);
            }
          });
        });
      }
    }
    function resetAddGlobalForm() {
      const title = root.getElementById("global-title");
      const val = root.getElementById("global-value");
      const keys = root.getElementById("global-keys");
      const desc = root.getElementById("global-description");
      const type = root.getElementById("global-type");
      const scFields = root.getElementById("sc-fields");
      if (title) title.value = "";
      if (val) val.value = "";
      if (keys) keys.value = "";
      if (desc) desc.value = "";
      if (type) type.value = "ain";
      if (scFields) scFields.style.display = "none";
    }
    root.querySelectorAll(".offmeta-subtab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const subTabId = btn.getAttribute("data-subtab");
        if (subTabId) switchSubTab(subTabId);
      });
    });
    root.getElementById("offmeta-search")?.addEventListener("input", () => {
      const statusEl = root.getElementById("offmeta-status");
      if (statusEl) statusEl.style.display = "none";
      renderOffMetaRepository();
    });
    $("open-settings").addEventListener("click", () => {
      root.getElementById("prompt-s1").value = lastState?.settings?.customPromptSection1 || DEFAULT_PROMPT_SECTION_1;
      root.getElementById("prompt-s2").value = lastState?.settings?.customPromptSection2 || DEFAULT_PROMPT_SECTION_2;
      root.getElementById("prompt-s3").value = lastState?.settings?.customPromptSection3 || DEFAULT_PROMPT_SECTION_3;
      root.getElementById("prompt-s4").value = lastState?.settings?.customPromptSection4 || DEFAULT_PROMPT_SECTION_4;
      for (const k of TYPE_KEYS) {
        const el = root.getElementById("cc-" + k);
        if (el) el.value = lastState?.settings?.cardCommands?.[k] || DEFAULT_CARD_COMMANDS[k] || "";
      }
      const fmtEl = root.getElementById("fmt-mode");
      if (fmtEl) fmtEl.value = lastState?.settings?.formattingMode || DEFAULT_FORMATTING_MODE;
      showSettingsView();
    });
    $("cancel-settings").addEventListener("click", showTrackerView);
    $("view-settings").addEventListener("click", (e) => {
      const target = e.target;
      const createConfigTab = target.closest("#create-memoraid-config-btn-tab");
      if (createConfigTab && createConfigCb) {
        createConfigTab.disabled = true;
        createConfigTab.textContent = "\u23F3 Creating Config Card...";
        createConfigCb();
      }
    });
    $("info-action-lookback").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-action-lookback").style.display = "flex";
    });
    $("info-memories").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-memories").style.display = "flex";
    });
    $("info-memoraid-lookback").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-memoraid-lookback").style.display = "flex";
    });
    $("info-memoraid-thought").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-memoraid-thought").style.display = "flex";
    });
    $("info-memoraid-presence").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-memoraid-presence").style.display = "flex";
    });
    $("info-intercept-timeout").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-intercept-timeout").style.display = "flex";
    });
    $("info-help").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-help").style.display = "flex";
    });
    root.addEventListener("click", async (e) => {
      const target = e.target;
      if (target.classList.contains("db-backup-trigger")) {
        e.stopPropagation();
        if (!backupAllCb) return;
        try {
          const res = await backupAllCb();
          if (res && res.ok && res.data) {
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `aid-story-helper-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast("Database backup downloaded successfully!");
          } else {
            showToast(res?.error || "Failed to generate backup", true);
          }
        } catch (err) {
          showToast(err?.message || String(err), true);
        }
      }
      if (target.closest(".db-restore-trigger")) {
        e.stopPropagation();
        if (!restoreAllCb) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const data = JSON.parse(reader.result);
              const res = await restoreAllCb?.(data);
              if (res && res.ok) {
                showToast("Database restored successfully!");
                const selfHeal = root.getElementById("self-heal-banner");
                if (selfHeal) selfHeal.style.display = "none";
                triggerRefresh();
              } else {
                showToast(res?.error || "Failed to restore backup", true);
              }
            } catch (err) {
              showToast("Invalid backup file: " + (err?.message || String(err)), true);
            }
          };
          reader.readAsText(file);
        });
        input.click();
      }
    });
    let syncKeys = true;
    const acTitleInput = root.getElementById("ac-title");
    const acKeysInput = root.getElementById("ac-keys");
    acTitleInput.addEventListener("input", () => {
      if (syncKeys) {
        acKeysInput.value = acTitleInput.value.trim().toLowerCase();
      }
    });
    acKeysInput.addEventListener("input", () => {
      syncKeys = false;
    });
    $("create-card-trigger").addEventListener("click", (e) => {
      e.stopPropagation();
      syncKeys = true;
      acTitleInput.value = "";
      acKeysInput.value = "";
      root.getElementById("ac-desc").value = "";
      root.getElementById("ac-value").value = "";
      $("overlay-add-card").style.display = "flex";
    });
    $("ac-submit").addEventListener("click", async () => {
      if (!createStoryCardCb) return;
      const type = root.getElementById("ac-type").value;
      const title = acTitleInput.value.trim();
      const keys = acKeysInput.value.trim();
      const description = root.getElementById("ac-desc").value.trim();
      const value = root.getElementById("ac-value").value.trim();
      if (!title) {
        showToast("Title / Name is required!", true);
        return;
      }
      const btnSubmit = root.getElementById("ac-submit");
      btnSubmit.disabled = true;
      btnSubmit.textContent = "\u23F3 Creating card on AID...";
      try {
        const res = await createStoryCardCb({ type, title, keys, value, description });
        if (res.error) {
          showToast(res.error, true);
        } else {
          showToast("Story card created successfully!");
          $("overlay-add-card").style.display = "none";
        }
      } catch (err) {
        showToast(err?.message || String(err), true);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Create & Push to AID";
      }
    });
    root.querySelectorAll(".overlay-close").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-close");
        if (id) $(id).style.display = "none";
      });
    });
    let activeTabId = "main-tab-tracker";
    let lastViewedMemoriesCount = -1;
    const knownMemories = /* @__PURE__ */ new Set();
    function switchMainTab(tabId) {
      activeTabId = tabId;
      const panes = root.querySelectorAll(".main-tab-pane");
      const btns = root.querySelectorAll(".main-tab-btn");
      panes.forEach((p) => {
        p.style.display = p.id === tabId ? "flex" : "none";
      });
      btns.forEach((b) => {
        if (b.getAttribute("data-tab") === tabId) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
      if (tabId === "main-tab-memories") {
        const badge = root.getElementById("unread-memories-badge");
        if (badge) {
          badge.style.display = "none";
          badge.className = "";
        }
        if (lastState?.aidMemories) {
          lastViewedMemoriesCount = lastState.aidMemories.length;
        }
      } else if (tabId === "main-tab-tracker") {
        const proposalsBadge = root.getElementById("tracker-proposals-badge");
        if (proposalsBadge) {
          proposalsBadge.style.display = "none";
          proposalsBadge.className = "";
        }
      }
    }
    root.querySelectorAll(".main-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        if (tabId) switchMainTab(tabId);
      });
    });
    const memListEl = root.getElementById("aid-memories-list");
    if (memListEl) {
      memListEl.addEventListener("click", (e) => {
        const target = e.target;
        const editBtn = target.closest(".mem-edit-btn");
        if (editBtn) {
          const card = editBtn.closest(".memory-card");
          const textEl = card.querySelector(".memory-card-text");
          const currentText = textEl.textContent || "";
          textEl.style.display = "none";
          editBtn.style.display = "none";
          let editArea = card.querySelector(".edit-area");
          if (!editArea) {
            editArea = document.createElement("div");
            editArea.className = "edit-area";
            editArea.style.cssText = "display:flex; flex-direction:column; gap:6px; margin-top:4px;";
            setSafeHTML(editArea, `
            <textarea class="edit-textarea" style="width:100%; min-height:60px; background:rgba(0,0,0,0.3); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; padding:6px; font-size:11.5px; line-height:1.4; resize:vertical; box-sizing:border-box; outline:none; font-family:inherit;"></textarea>
            <div style="display:flex; gap:6px; justify-content:flex-end;">
              <button class="edit-cancel-btn action-btn" style="padding:2px 8px;">Cancel</button>
              <button class="edit-save-btn action-btn" style="padding:2px 8px; background:rgba(16,185,129,0.15); color:#10b981; border-color:rgba(16,185,129,0.3);">Save</button>
            </div>
          `);
            card.appendChild(editArea);
          }
          const textarea = editArea.querySelector(".edit-textarea");
          textarea.value = currentText;
          textarea.focus();
          return;
        }
        const cancelBtn = target.closest(".edit-cancel-btn");
        if (cancelBtn) {
          const card = cancelBtn.closest(".memory-card");
          const textEl = card.querySelector(".memory-card-text");
          const editBtn2 = card.querySelector(".mem-edit-btn");
          const editArea = card.querySelector(".edit-area");
          if (textEl) textEl.style.display = "block";
          if (editBtn2) editBtn2.style.display = "inline-flex";
          if (editArea) editArea.remove();
          return;
        }
        const saveBtn = target.closest(".edit-save-btn");
        if (saveBtn) {
          const card = saveBtn.closest(".memory-card");
          const idx = parseInt(card.getAttribute("data-idx"), 10);
          const textarea = card.querySelector(".edit-textarea");
          const newText = textarea.value.trim();
          if (newText && lastState?.aidMemories) {
            const updatedMemories = [...lastState.aidMemories];
            const item = updatedMemories[idx];
            if (item) {
              updatedMemories[idx] = {
                actionIds: item.actionIds || [],
                text: newText,
                lastRelevantActionId: item.lastRelevantActionId
              };
              updateAidMemoriesCb?.(updatedMemories);
            }
          }
          return;
        }
        const deleteBtn = target.closest(".mem-delete-btn");
        if (deleteBtn) {
          const card = deleteBtn.closest(".memory-card");
          const idx = parseInt(card.getAttribute("data-idx"), 10);
          if (lastState?.aidMemories) {
            const updatedMemories = [...lastState.aidMemories];
            updatedMemories.splice(idx, 1);
            updateAidMemoriesCb?.(updatedMemories);
          }
          return;
        }
        const refineBtn = target.closest(".mem-refine-btn");
        if (refineBtn) {
          const card = refineBtn.closest(".memory-card");
          const idx = parseInt(card.getAttribute("data-idx"), 10);
          const btn = refineBtn;
          btn.disabled = true;
          btn.style.opacity = "0.5";
          btn.title = "Regenerating...";
          refineMemoryBlockCb?.(idx);
          return;
        }
      });
    }
    $("revert-prompt").addEventListener("click", () => {
      root.getElementById("prompt-s1").value = DEFAULT_PROMPT_SECTION_1;
      root.getElementById("prompt-s2").value = DEFAULT_PROMPT_SECTION_2;
      root.getElementById("prompt-s3").value = DEFAULT_PROMPT_SECTION_3;
      root.getElementById("prompt-s4").value = DEFAULT_PROMPT_SECTION_4;
      for (const k of TYPE_KEYS) {
        const el = root.getElementById("cc-" + k);
        if (el) el.value = DEFAULT_CARD_COMMANDS[k] ?? "";
      }
      const fmtEl = root.getElementById("fmt-mode");
      if (fmtEl) fmtEl.value = DEFAULT_FORMATTING_MODE;
    });
    let decisionCb = null;
    let pushCb = null;
    let genCardCb = null;
    let updateAidMemoriesCb = null;
    let refineMemoryBlockCb = null;
    let analyzeCb = null;
    let themeChangeCb = null;
    let applyInstructionCb = null;
    let createConfigCb = null;
    let dismissMemoraidBannerCb = null;
    let createStoryCardCb = null;
    let saveCardKeysCb = null;
    results.addEventListener("click", (e) => {
      const target = e.target;
      const createConfig = target.closest("#create-memoraid-config-btn");
      if (createConfig && createConfigCb) {
        createConfig.disabled = true;
        createConfig.textContent = "\u23F3 Creating Config Card...";
        createConfigCb();
        return;
      }
      const dismissBanner = target.closest("#dismiss-memoraid-banner-btn");
      if (dismissBanner && dismissMemoraidBannerCb) {
        dismissBanner.disabled = true;
        dismissMemoraidBannerCb();
        return;
      }
      const dismissSelfHeal = target.closest("#dismiss-self-heal-btn");
      if (dismissSelfHeal) {
        selfHealDismissed = true;
        const banner = root.getElementById("self-heal-banner");
        if (banner) banner.style.display = "none";
        return;
      }
      const an = target.closest("#an");
      if (an && analyzeCb) {
        showAnalyzeView();
        setAnalyzeLoading();
        analyzeCb();
        return;
      }
      const gen = target.closest("[data-gen-card]");
      if (gen && genCardCb) {
        const cardId = gen.getAttribute("data-gen-card");
        if (cardId) {
          gen.disabled = true;
          const providerKey = lastState?.settings?.provider || "claude";
          let providerLabel = "Claude";
          if (providerKey === "openai") providerLabel = "OpenAI";
          else if (providerKey === "gemini") providerLabel = "Gemini";
          else if (providerKey === "ollama") providerLabel = "Ollama";
          gen.textContent = `\u23F3 Generating via ${providerLabel}\u2026`;
          genCardCb(cardId);
        }
        return;
      }
      const triggersSubmit = target.closest(".triggers-submit-btn");
      if (triggersSubmit && saveCardKeysCb) {
        const cardId = triggersSubmit.getAttribute("data-card-id");
        if (cardId) {
          const inputEl = results.querySelector(`.triggers-input[data-card-id="${cardId}"]`);
          const newKeys = inputEl?.value.trim() || "";
          const btn = triggersSubmit;
          btn.disabled = true;
          btn.textContent = "\u23F3";
          saveCardKeysCb(cardId, newKeys).then((res) => {
            if (res?.error) {
              showToast(res.error, true);
            } else {
              showToast("Triggers updated successfully!");
            }
          }).catch((err) => {
            showToast(err?.message || String(err), true);
          }).finally(() => {
            btn.disabled = false;
            btn.textContent = "\u2713";
          });
        }
        return;
      }
      const entrySubmit = target.closest(".entry-submit-btn");
      if (entrySubmit && saveCardValueCb) {
        const cardId = entrySubmit.getAttribute("data-card-id");
        if (cardId) {
          const inputEl = results.querySelector(`.entry-input[data-card-id="${cardId}"]`);
          const newValue = inputEl?.value.trim() || "";
          const btn = entrySubmit;
          btn.disabled = true;
          btn.textContent = "\u23F3";
          saveCardValueCb(cardId, newValue).then((res) => {
            if (res?.error) {
              showToast(res.error, true);
            } else {
              showToast("Entry updated successfully!");
            }
          }).catch((err) => {
            showToast(err?.message || String(err), true);
          }).finally(() => {
            btn.disabled = false;
            btn.textContent = "\u2713";
          });
        }
        return;
      }
      const t = target.closest("[data-act]");
      if (!t) return;
      const vid = t.getAttribute("data-vid");
      const act = t.getAttribute("data-act");
      console.log("[AID panel] Click detected. act:", act, "vid:", vid);
      if (vid && (act === "applied" || act === "rejected") && decisionCb) {
        console.log("[AID panel] Triggering decisionCb for vid:", vid, "act:", act);
        decisionCb(vid, act);
      }
      if (vid && act === "push" && pushCb) {
        console.log("[AID panel] Triggering pushCb (onPushVersion) for vid:", vid);
        pushCb(vid);
      }
    });
    analyzeBody.addEventListener("click", (e) => {
      const t = e.target.closest("[data-act]");
      if (!t) return;
      const vid = t.getAttribute("data-vid");
      const act = t.getAttribute("data-act");
      if (vid && (act === "applied" || act === "rejected") && decisionCb) {
        decisionCb(vid, act);
        const actions = t.closest("[data-prop]")?.querySelector(".prop-actions");
        if (actions) setSafeHTML(actions, act === "applied" ? `<span class="note" style="color:var(--accent-color);font-weight:600;">\u2713 Accepted</span>` : `<span class="note" style="color:#f87171;">Rejected</span>`);
      }
    });
    function esc(s) {
      return s.replace(/[\u0026\u003c\u003e\u0022]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
    function buildCardPickerOptions(cards) {
      const TYPE_LABELS = { character: "Characters", class: "Classes", race: "Races", location: "Locations", faction: "Factions", custom: "Custom" };
      const byType = /* @__PURE__ */ new Map();
      for (const c of cards ?? []) {
        if (c.deletedAt) continue;
        const t = (c.type || "custom").toLowerCase();
        const arr = byType.get(t) ?? [];
        arr.push({ id: c.id, label: c.title || c.keys || "(untitled)" });
        byType.set(t, arr);
      }
      const order = ["character", "location", "faction", "class", "race", "custom"];
      const orderedTypes = [...byType.keys()].sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
      });
      let html = `<option value="" selected>-- existing card --</option>`;
      for (const t of orderedTypes) {
        const label = TYPE_LABELS[t] ?? t;
        const opts = byType.get(t).sort((a, b) => a.label.localeCompare(b.label));
        html += `<optgroup label="${esc(label)}">` + opts.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("") + `</optgroup>`;
      }
      return html;
    }
    function buildTypePickerOptions(cards, selected) {
      const base = [
        ["", "None"],
        ["character", "Character"],
        ["class", "Class"],
        ["race", "Race"],
        ["location", "Location"],
        ["faction", "Faction"],
        ["custom", "Custom"]
      ];
      const reserved = /* @__PURE__ */ new Set(["", "character", "class", "race", "location", "faction", "custom", "memory"]);
      const sel = (selected || "").trim().toLowerCase();
      const customTypes = [];
      const seen = /* @__PURE__ */ new Set();
      for (const c of cards ?? []) {
        if (c.deletedAt) continue;
        const t = (c.type || "").trim();
        const tl = t.toLowerCase();
        if (!t || reserved.has(tl) || seen.has(tl)) continue;
        seen.add(tl);
        customTypes.push(t);
      }
      customTypes.sort((a, b) => a.localeCompare(b));
      let html = base.map(([v, l]) => `<option value="${esc(v)}"${sel === v ? " selected" : ""}>${esc(l)}</option>`).join("");
      if (customTypes.length) {
        html += `<optgroup label="Detected Custom Types">` + customTypes.map((t) => `<option value="${esc(t)}"${sel === t.toLowerCase() ? " selected" : ""}>${esc(t)}</option>`).join("") + `</optgroup>`;
      }
      return html;
    }
    function showAnalyzeResultFn(res) {
      if (!res) {
        setSafeHTML(analyzeBody, `<div class="note">No response.</div>`);
        return;
      }
      if (res.error) {
        setSafeHTML(analyzeBody, `<div style="padding:12px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.06);border-radius:8px;color:#fca5a5;font-size:12px;">${esc(res.error)}</div><button id="analyze-done" style="margin-top:12px;width:100%;background:var(--btn-bg);border:1px solid var(--border-color);color:var(--text-primary);font-weight:600;padding:6px;border-radius:6px;">\u2190 Back to Tracker</button>`);
        root.getElementById("analyze-done")?.addEventListener("click", showTrackerView);
        return;
      }
      const count2 = res.count ?? 0;
      const proposals = res.proposals ?? [];
      let html = `<div style="font-weight:700;color:var(--accent-color);font-size:14px;margin-bottom:8px;">${count2} proposal${count2 === 1 ? "" : "s"}</div>`;
      if (count2 === 0) {
        html += `<div class="note" style="padding:10px;border:1px solid var(--border-color);border-radius:8px;">No changes detected \u2014 everything is already up to date.</div>`;
      } else {
        html += proposals.map(
          (p) => `<div class="prop" data-prop><div class="sum">${esc(p.characterName)}</div><div style="color:#9fd;font-size:11px;margin:2px 0 4px;">${esc(p.changeSummary)}</div><details><summary style="color:var(--accent-color);">view proposed entry</summary><div class="code-card"><pre>${esc(p.entry)}</pre></div></details><div class="prop-actions" style="margin-top:6px;"><button data-vid="${esc(p.id)}" data-act="applied" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);padding:3px 10px;border-radius:6px;font-size:10px;margin-right:4px;">Accept</button><button data-vid="${esc(p.id)}" data-act="rejected" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:3px 10px;border-radius:6px;font-size:10px;">Reject</button></div></div>`
        ).join("");
      }
      if (res.warnings?.length) {
        html += `<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--text-secondary);font-size:11px;">${res.warnings.length} warning(s)</summary><ul style="margin:4px 0;padding-left:18px;">` + res.warnings.map((w) => `<li class="note" style="margin:2px 0;">${esc(w)}</li>`).join("") + `</ul></details>`;
      }
      html += `<button id="analyze-done" style="margin-top:12px;width:100%;background:linear-gradient(135deg, var(--accent-color), var(--accent-border));color:#fff;font-weight:600;padding:6px;border-radius:6px;border:none;">View Tracker</button>`;
      setSafeHTML(analyzeBody, html);
      root.getElementById("analyze-done")?.addEventListener("click", showTrackerView);
    }
    function renderMemoriesSection(state) {
      const refineBtn = root.getElementById("refine-mem");
      if (refineBtn) {
        refineBtn.disabled = false;
        refineBtn.textContent = "\u26A1 Regenerate Latest";
      }
      const memListEl2 = root.getElementById("aid-memories-list");
      if (memListEl2) {
        if (!state.aidMemories || state.aidMemories.length === 0) {
          setSafeHTML(memListEl2, `<div class="note" style="padding:12px;text-align:center;">No AID-generated memories captured yet.</div>`);
        } else {
          const actionMap = /* @__PURE__ */ new Map();
          if (state.actions) {
            for (const a of state.actions) {
              actionMap.set(a.id, a.text || "");
            }
          }
          const isInitialLoad = knownMemories.size === 0;
          const itemsWithIndex = state.aidMemories.map((m, index) => ({ m, index }));
          const reversedItems = [...itemsWithIndex].reverse();
          setSafeHTML(memListEl2, reversedItems.map(({ m, index }) => {
            const text = typeof m === "string" ? m : m?.text || "";
            const rawM = m;
            const isUsed = m && typeof m !== "string" && (rawM.used === true || rawM.isUsed === true || rawM.active === true);
            let statusClass = "stored";
            let statusText = "Stored Context";
            if (isUsed) {
              statusClass = "used";
              statusText = "Used Memory";
            }
            const key = m && typeof m !== "string" && m.actionIds && m.actionIds.length > 0 ? m.actionIds.join(",") : text;
            const isNew = !isInitialLoad && key ? !knownMemories.has(key) : false;
            if (key) {
              knownMemories.add(key);
            }
            const matchedTexts = m && typeof m !== "string" && m.actionIds ? m.actionIds.map((id) => actionMap.get(id)).filter((t) => !!t) : [];
            const contextHtml = matchedTexts.length > 0 ? `<details class="memory-context" style="margin-top:6px; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">
                 <summary style="cursor:pointer; color:var(--text-secondary); font-size:10px; outline:none; user-select:none;">View Story Context (${matchedTexts.length} turns)</summary>
                 <div class="code-card" style="margin-top:4px; max-height:120px; overflow-y:auto; font-size:10.5px; line-height:1.4; color:var(--text-secondary); white-space:pre-wrap; background:rgba(0,0,0,0.15); border-radius:4px; padding:6px;">${matchedTexts.map((t) => esc(t)).join("\n\n")}</div>
               </details>` : "";
            return `
            <div class="memory-card ${isNew ? "ping-new" : ""}" data-idx="${index}">
              <div class="memory-card-header">
                <div style="display:flex;align-items:center;">
                  <span class="memory-status-dot ${statusClass}"></span>
                  <span>${statusText}</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  <button class="mem-refine-btn" style="background:none;border:none;padding:2px;cursor:pointer;color:#eab308;display:inline-flex;align-items:center;justify-content:center;" title="Regenerate memory block">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
                    </svg>
                  </button>
                  <button class="mem-edit-btn" style="background:none;border:none;padding:2px;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;" title="Edit memory">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c0.39-0.39 0.39-1.02 0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                  </button>
                  <button class="mem-delete-btn" style="background:none;border:none;padding:2px;cursor:pointer;color:#f87171;display:inline-flex;align-items:center;justify-content:center;" title="Delete memory">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="memory-card-text">${esc(text)}</div>
              ${contextHtml}
            </div>
          `;
          }).join(""));
        }
      }
      const memoriesCount = state.aidMemories?.length ?? 0;
      if (lastViewedMemoriesCount === -1) {
        lastViewedMemoriesCount = memoriesCount;
      }
      const badge = root.getElementById("unread-memories-badge");
      if (badge) {
        if (activeTabId === "main-tab-memories") {
          lastViewedMemoriesCount = memoriesCount;
          badge.style.display = "none";
          badge.className = "";
        } else if (memoriesCount > lastViewedMemoriesCount) {
          badge.textContent = `+${memoriesCount - lastViewedMemoriesCount}`;
          badge.style.display = "inline-block";
          badge.className = "badge-new-memories";
        } else {
          badge.style.display = "none";
          badge.className = "";
        }
      }
    }
    return {
      setStatus: (t) => {
        st.textContent = t;
      },
      showToast: (text, isError) => showToast(text, isError),
      onExport: (cb) => {
        $("ex-story").addEventListener("click", () => cb("story"));
        $("ex-cards").addEventListener("click", () => cb("cards"));
        $("ex-pe").addEventListener("click", () => cb("pe"));
        $("ex-aidmemories").addEventListener("click", () => cb("aidmemories"));
        $("ex-propernouns")?.addEventListener("click", () => cb("propernouns"));
        $("ex-all").addEventListener("click", () => cb("all"));
      },
      onBackfill: (cb) => $("bf").addEventListener("click", cb),
      onRefineMemoryBlock: (cb) => {
        refineMemoryBlockCb = cb;
        $("refine-mem")?.addEventListener("click", () => {
          const btn = $("refine-mem");
          if (btn) {
            btn.disabled = true;
            btn.textContent = "Regenerating memory...";
          }
          if (refineMemoryBlockCb && lastState?.aidMemories && lastState.aidMemories.length > 0) {
            refineMemoryBlockCb(lastState.aidMemories.length - 1);
          }
        });
      },
      onAnalyze: (cb) => {
        analyzeCb = cb;
      },
      showAnalyzeResult: showAnalyzeResultFn,
      onSaveSettings: (cb) => $("save").addEventListener("click", () => {
        const n = parseInt(winEl.value, 10);
        const showDbg = root.getElementById("show-dbg").checked;
        const logPE = root.getElementById("log-pe-console").checked;
        const useMems = root.getElementById("use-memories").checked;
        const autoRegenMems = root.getElementById("auto-regen-memories").checked;
        const cardCommands = {};
        for (const k of TYPE_KEYS) {
          const el = root.getElementById("cc-" + k);
          const v = el?.value.trim();
          if (v) cardCommands[k] = v;
        }
        const fmtMode = root.getElementById("fmt-mode")?.value || DEFAULT_FORMATTING_MODE;
        const ml = parseInt(memoraidWinEl.value, 10);
        const mtl = parseInt(memoraidThoughtWinEl.value, 10);
        const mpl = parseInt(memoraidPresenceWinEl.value, 10);
        const to = parseInt(interceptTimeoutEl.value, 10);
        const memoraidLookback = Number.isFinite(ml) && ml > 0 ? ml : 8;
        const memoraidThoughtLookback = Number.isFinite(mtl) && mtl >= 1 ? mtl : 1;
        const memoraidPresenceLookback = Number.isFinite(mpl) && mpl > 0 ? mpl : 5;
        const interceptTimeout = Number.isFinite(to) && to > 0 ? to : 10;
        const locMode = root.getElementById("location-mode").value;
        const properNounDetect = root.getElementById("enable-proper-noun-detection").checked;
        const manualMode = root.getElementById("enable-manual-mode").checked;
        const ccl = parseInt(charCardLimitEl.value, 10);
        const tcl = parseInt(thoughtCardLimitEl.value, 10);
        const characterCardLimit = Number.isFinite(ccl) && ccl >= 100 ? ccl : 600;
        const thoughtCardLimit = Number.isFinite(tcl) && tcl >= 100 ? tcl : 2e3;
        cb(
          provEl.value,
          keyEl.value.trim(),
          protEl.value.trim(),
          modelEl.value.trim(),
          Number.isFinite(n) && n > 0 ? n : 20,
          showDbg,
          themeEl.value,
          root.getElementById("prompt-s1").value,
          root.getElementById("prompt-s2").value,
          root.getElementById("prompt-s3").value,
          root.getElementById("prompt-s4").value,
          cardCommands,
          useMems,
          fmtMode,
          memoraidLookback,
          memoraidThoughtLookback,
          memoraidPresenceLookback,
          autoRegenMems,
          interceptTimeout,
          lastState?.settings?.useSinglePassGeneration ?? false,
          locMode,
          properNounDetect,
          manualMode,
          logPE,
          characterCardLimit,
          thoughtCardLimit
        );
        showTrackerView();
      }),
      onThemeChange: (cb) => {
        themeChangeCb = cb;
      },
      onApplyInstruction: (cb) => {
        applyInstructionCb = cb;
      },
      onProposalDecision: (cb) => {
        decisionCb = cb;
      },
      onPushVersion: (cb) => {
        pushCb = cb;
      },
      onGenerateCard: (cb) => {
        genCardCb = cb;
      },
      onUpdateAidMemories: (cb) => {
        updateAidMemoriesCb = cb;
      },
      onCreateConfigCard: (cb) => {
        createConfigCb = cb;
      },
      onCreateStoryCard: (cb) => {
        createStoryCardCb = cb;
      },
      onSaveCardKeys: (cb) => {
        saveCardKeysCb = cb;
      },
      onGrantPermissions: (cb) => {
        $("grant-permissions")?.addEventListener("click", cb);
      },
      onSetActiveLocation: (cb) => {
        setActiveLocationCb = cb;
      },
      onRespondToProperNounSuggestion: (cb) => {
        respondToProperNounSuggestionCb = cb;
      },
      onUpdateProperNounLog: (cb) => {
        updateProperNounLogCb = cb;
      },
      onLinkProperNounToCard: (cb) => {
        linkProperNounToCardCb = cb;
      },
      onDeleteProperNounLog: (cb) => {
        deleteProperNounLogCb = cb;
      },
      onClearProperNounLogs: (cb) => {
        clearProperNounLogsCb = cb;
      },
      onSaveGlobalAsset: (cb) => {
        saveGlobalAssetCb = cb;
      },
      onDeleteGlobalAsset: (cb) => {
        deleteGlobalAssetCb = cb;
      },
      onImportGlobalAsset: (cb) => {
        importGlobalAssetCb = cb;
      },
      onRefresh: (cb) => {
        refreshCb = cb;
      },
      onProviderChange: (cb) => {
        providerChangeCb = cb;
      },
      onDismissMemoraidBanner: (cb) => {
        dismissMemoraidBannerCb = cb;
      },
      onBackupAll: (cb) => {
        backupAllCb = cb;
      },
      onRestoreAll: (cb) => {
        restoreAllCb = cb;
      },
      onSaveCardValue: (cb) => {
        saveCardValueCb = cb;
      },
      updateActionCount: (count2, lastAnalysisAction) => {
        if (lastState) {
          lastState.actionCount = count2;
          lastState.actionsCount = count2;
          if (lastAnalysisAction !== void 0) lastState.lastAnalysisAction = lastAnalysisAction;
        }
        const statTurn = root.getElementById("stat-turn");
        if (statTurn) statTurn.textContent = String(count2);
        const lastAn = lastAnalysisAction ?? lastState?.lastAnalysisAction ?? 0;
        const statSince = root.getElementById("stat-since");
        if (statSince) statSince.textContent = lastAn > 0 ? String(count2 - lastAn) : "-";
      },
      updateMemories: (memories) => {
        if (!lastState) return;
        lastState.aidMemories = memories ?? [];
        renderMemoriesSection(lastState);
      },
      updateMemoraidTiming: (stats) => {
        if (lastState) lastState.memoraidTiming = stats;
        applyMemoraidTiming(stats);
      },
      setModels: (models, current) => {
        const opts = [...models];
        if (current && !opts.includes(current)) opts.unshift(current);
        setSafeHTML(modelEl, opts.length ? opts.map((m) => `<option value="${esc(m)}"${m === current ? " selected" : ""}>${esc(m)}</option>`).join("") : `<option value="">(enter API key, then reopen settings)</option>`);
        if (current) modelEl.value = current;
        if (modelSearchEl) {
          modelSearchEl.value = modelEl.value;
          modelSearchEl.placeholder = opts.length ? "Search models\u2026" : "(enter API key, then reopen settings)";
        }
        if (modelListEl && modelListEl.style.display === "block" && modelSearchEl) {
          renderModelList(modelSearchEl.value);
        }
      },
      showDebug: (d) => {
        if (d && lastState?.settings?.logPlotEssentials) {
          console.log("[AID] Update Plot Essentials \u2014 raw analyze debug:", {
            characters: d.characters,
            narrativeChars: d.narrativeChars,
            narrativeTail: d.narrativeTail,
            rawResponse: d.rawSnippet,
            windowN: d.windowN
          });
        }
      },
      render: (state) => {
        const prevState = lastState;
        lastState = state;
        const tabManagerPane = root.getElementById("tab-manager");
        if (tabManagerPane && (tabManagerPane.style.display === "block" || tabManagerPane.style.display === "flex" || state.isManagerOnly)) {
          renderAdventuresManager(state);
        }
        const isManagerOnly = !!state.isManagerOnly;
        if (isManagerOnly) {
          viewTracker.style.display = "none";
          viewSettings.style.display = "flex";
          viewAnalyze.style.display = "none";
          const tabNav = viewSettings.querySelector(".tab-nav");
          if (tabNav) tabNav.style.display = "none";
          const footer = root.getElementById("settings-footer");
          if (footer) footer.style.display = "none";
          viewSettings.querySelectorAll(".tab-pane").forEach((pane) => {
            if (pane.id !== "tab-manager") {
              pane.style.display = "none";
            }
          });
          if (tabManagerPane) tabManagerPane.style.display = "flex";
        } else {
          const tabNav = viewSettings.querySelector(".tab-nav");
          if (tabNav) tabNav.style.display = "flex";
          const footer = root.getElementById("settings-footer");
          if (footer) footer.style.display = "flex";
          const activeBtn = viewSettings.querySelector(".tab-btn.active");
          const currentActiveTab = activeBtn?.getAttribute("data-tab");
          if (currentActiveTab) {
            switchTab(currentActiveTab);
          }
          if (prevState && prevState.isManagerOnly && !isManagerOnly) {
            showTrackerView();
          }
        }
        const isShortIdChanged = !prevState || state.shortId !== prevState.shortId;
        if (state.scenario !== prevState?.scenario || state.protagonist !== prevState?.protagonist) {
          knownMemories.clear();
        }
        const titleTail = [state.scenario, state.protagonist].filter(Boolean).join(" - ");
        st.textContent = titleTail ? `AID Story Helper: ${titleTail}` : "AID Story Helper";
        if (isShortIdChanged) {
          protEl.value = state.protagonist || "";
        } else if (document.activeElement !== protEl) {
          protEl.value = state.protagonist || "";
        }
        if (state.settings?.theme && themeEl.value !== state.settings.theme) {
          themeEl.value = state.settings.theme;
          updateThemeClass();
        }
        if (state.settings?.provider && provEl.value !== state.settings.provider) {
          provEl.value = state.settings.provider;
          updateProviderLabels();
        }
        const prov = provEl.value;
        if (state.settings?.keyStatus?.[prov] && !keyEl.value) {
          keyEl.placeholder = "\u2022\u2022\u2022\u2022 (key saved)";
        } else if (!keyEl.value) {
          updateProviderLabels();
        }
        if (state.settings?.analyzeWindow && !winEl.value) winEl.value = String(state.settings.analyzeWindow);
        if (state.settings && !memoraidWinEl.value) {
          memoraidWinEl.value = String(state.settings.memoraidLookback ?? 8);
        }
        if (state.settings && !memoraidThoughtWinEl.value) {
          const val = state.settings.memoraidThoughtLookback ?? 1;
          memoraidThoughtWinEl.value = String(val >= 1 ? val : 1);
        }
        if (state.settings && !memoraidPresenceWinEl.value) {
          memoraidPresenceWinEl.value = String(state.settings.memoraidPresenceLookback ?? 5);
        }
        if (state.settings && !interceptTimeoutEl.value) {
          interceptTimeoutEl.value = String(state.settings.interceptTimeout ?? 10);
        }
        if (state.settings && !charCardLimitEl.value) {
          charCardLimitEl.value = String(state.settings.characterCardLimit ?? 600);
        }
        if (state.settings && !thoughtCardLimitEl.value) {
          thoughtCardLimitEl.value = String(state.settings.thoughtCardLimit ?? 2e3);
        }
        applyMemoraidTiming(state.memoraidTiming);
        const locModeEl = root.getElementById("location-mode");
        if (locModeEl && state.settings) {
          locModeEl.value = state.settings.locationMode || "optionA";
        }
        const properNounDetectEl = root.getElementById("enable-proper-noun-detection");
        if (properNounDetectEl && state.settings) {
          properNounDetectEl.checked = state.settings.enableProperNounDetection !== false;
        }
        const hasConfigCard = (state.cards ?? []).some(
          (c) => !c.deletedAt && (c.title || "").toLowerCase() === "configure memoraid"
        );
        const memoraidTabBannerContainer = root.getElementById("memoraid-tab-config-banner-container");
        if (memoraidTabBannerContainer) {
          if (!hasConfigCard) {
            memoraidTabBannerContainer.innerHTML = `<div class="memoraid-config-banner" style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:10px;margin-bottom:12px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;width:100%;"><div style="font-weight:700;color:#fbbf24;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Enable MemorAID Thought Tracking</div><div class="note" style="margin:0;font-size:11px;line-height:1.4;color:var(--text-secondary);">To automatically track NPC thoughts in memory cards, create the config card first.</div><button id="create-memoraid-config-btn-tab" style="background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:500;align-self:flex-start;transition:background 0.2s;width:auto;min-height:unset;">Create Config Card</button></div>`;
          } else {
            memoraidTabBannerContainer.innerHTML = "";
          }
        }
        const manualModeEl = root.getElementById("enable-manual-mode");
        if (manualModeEl && state.settings) {
          manualModeEl.checked = !!state.settings.manualMode;
        }
        const showDbgEl = root.getElementById("show-dbg");
        if (showDbgEl && state.settings) {
          showDbgEl.checked = !!state.settings.showDebug;
        }
        const logPeEl = root.getElementById("log-pe-console");
        if (logPeEl && state.settings) {
          logPeEl.checked = !!state.settings.logPlotEssentials;
        }
        const useMemsEl = root.getElementById("use-memories");
        if (useMemsEl && state.settings) {
          useMemsEl.checked = !!state.settings.useMemories;
        }
        const autoRegenMemsEl = root.getElementById("auto-regen-memories");
        if (autoRegenMemsEl && state.settings) {
          autoRegenMemsEl.checked = !!state.settings.autoRegenerateNativeMemories;
        }
        if (state.settings) {
          const s1 = root.getElementById("prompt-s1");
          const s2 = root.getElementById("prompt-s2");
          const s3 = root.getElementById("prompt-s3");
          const s4 = root.getElementById("prompt-s4");
          if (s1 && root.activeElement !== s1) s1.value = state.settings.customPromptSection1 || DEFAULT_PROMPT_SECTION_1;
          if (s2 && root.activeElement !== s2) s2.value = state.settings.customPromptSection2 || DEFAULT_PROMPT_SECTION_2;
          if (s3 && root.activeElement !== s3) s3.value = state.settings.customPromptSection3 || DEFAULT_PROMPT_SECTION_3;
          if (s4 && root.activeElement !== s4) s4.value = state.settings.customPromptSection4 || DEFAULT_PROMPT_SECTION_4;
        }
        const opsEl = root.getElementById("learned-ops-list");
        if (opsEl && state.ops) {
          opsEl.textContent = state.ops.length > 0 ? state.ops.map((o) => `${o.kind === "write" ? "\u270D" : "\u{1F4D6}"} ${o.operationName}:
${o.query.trim()}`).join("\n\n---\n\n") : "None";
        }
        const statTurn = root.getElementById("stat-turn");
        const statLastAuto = root.getElementById("stat-last-auto");
        const curAction = state.actionCount ?? state.actionsCount ?? 0;
        const selfHealBanner = root.getElementById("self-heal-banner");
        if (selfHealBanner) {
          selfHealBanner.style.display = isLocalDbEmpty(state) && !selfHealDismissed ? "block" : "none";
        }
        if (statTurn) statTurn.textContent = String(curAction);
        if (statLastAuto) {
          statLastAuto.textContent = state.lastAutoUpdatedCard || "-";
        }
        const charGroups = /* @__PURE__ */ new Map();
        for (const v of state.versions) {
          const key = v.characterName + (v.source === "card" ? "::" + (v.cardType || "character") : "");
          const arr = charGroups.get(key) ?? [];
          arr.push(v);
          charGroups.set(key, arr);
        }
        for (const [name, list] of charGroups.entries()) {
          list.sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
        }
        let html = "";
        const hasConfigCardVal = (state.cards ?? []).some(
          (c) => !c.deletedAt && (c.title || "").toLowerCase() === "configure memoraid"
        );
        if (!hasConfigCardVal && state.settings?.memoraidBannerDismissed !== true) {
          html += `<div class="memoraid-config-banner" style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:10px;margin-bottom:12px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;width:100%;"><div style="font-weight:700;color:#fbbf24;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Enable MemorAID Thought Tracking</div><div class="note" style="margin:0;font-size:11px;line-height:1.4;color:var(--text-secondary);">To automatically track NPC thoughts in memory cards, create the config card first.</div><div style="display:flex;gap:8px;align-items:center;margin-top:4px;"><button id="create-memoraid-config-btn" style="background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:500;transition:background 0.2s;width:auto;min-height:unset;">Create Config Card</button><button id="dismiss-memoraid-banner-btn" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:11px;font-weight:500;padding:5px 10px;text-decoration:underline;margin:0;">Dismiss</button></div></div>`;
        }
        const allNames = Array.from(charGroups.keys());
        const sortedNames = [];
        const placedNames = /* @__PURE__ */ new Set();
        const addName = (n) => {
          const lower = n.trim().toLowerCase();
          for (const an of allNames) {
            const namePart = (an.split("::")[0] || "").trim().toLowerCase();
            if (namePart === lower) {
              const anLower = an.trim().toLowerCase();
              if (!placedNames.has(anLower)) {
                sortedNames.push(an);
                placedNames.add(anLower);
              }
            }
          }
        };
        if (state.protagonist) {
          addName(state.protagonist);
        }
        if (state.memory) {
          const blocks = parsePlotEssentials(state.memory);
          for (const b of blocks) {
            addName(b.name);
          }
        }
        const remaining = allNames.filter((n) => !placedNames.has(n.trim().toLowerCase())).sort((a, b) => a.localeCompare(b));
        for (const n of remaining) {
          const firstPart = n.split("::")[0];
          if (firstPart) {
            addName(firstPart);
          }
        }
        const sortedChars = sortedNames.map((name) => [name, charGroups.get(name)]);
        const cardTypeByName = /* @__PURE__ */ new Map();
        const cardIdByName = /* @__PURE__ */ new Map();
        const deletedNames = /* @__PURE__ */ new Set();
        for (const c of state.cards ?? []) {
          const keysList = (c.keys || "").split(/[,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
          for (const k of keysList) {
            cardTypeByName.set(k, c.type || "character");
            cardIdByName.set(k + "::" + (c.type || "character").toLowerCase(), c.id);
            cardIdByName.set(k, c.id);
            if (c.deletedAt) {
              deletedNames.add(k + "::" + (c.type || "character").toLowerCase());
              deletedNames.add(k);
            } else {
              deletedNames.delete(k + "::" + (c.type || "character").toLowerCase());
              deletedNames.delete(k);
            }
          }
          const fullKey = (c.title || c.keys || "").trim().toLowerCase();
          if (fullKey) {
            cardTypeByName.set(fullKey, c.type || "character");
            cardIdByName.set(fullKey + "::" + (c.type || "character").toLowerCase(), c.id);
            cardIdByName.set(fullKey, c.id);
            if (c.deletedAt) {
              deletedNames.add(fullKey + "::" + (c.type || "character").toLowerCase());
              deletedNames.add(fullKey);
            } else {
              deletedNames.delete(fullKey + "::" + (c.type || "character").toLowerCase());
              deletedNames.delete(fullKey);
            }
          }
        }
        for (const c of state.cards ?? []) {
          if (c.title) {
            const titleLower = c.title.trim().toLowerCase();
            cardTypeByName.set(titleLower, c.type || "character");
            cardIdByName.set(titleLower + "::" + (c.type || "character").toLowerCase(), c.id);
            cardIdByName.set(titleLower, c.id);
            if (c.deletedAt) {
              deletedNames.add(titleLower + "::" + (c.type || "character").toLowerCase());
              deletedNames.add(titleLower);
            } else {
              deletedNames.delete(titleLower + "::" + (c.type || "character").toLowerCase());
              deletedNames.delete(titleLower);
            }
          }
        }
        const plotNames = /* @__PURE__ */ new Set();
        if (state.protagonist) plotNames.add(state.protagonist.trim().toLowerCase());
        for (const b of parsePlotEssentials(state.memory || "")) plotNames.add(b.name.trim().toLowerCase());
        const TYPE_LABELS = { character: "Characters", class: "Classes", race: "Races", location: "Locations", faction: "Factions" };
        const typeLabelFor = (key) => {
          const parts = key.split("::");
          const name = parts[0] || "";
          const type = parts[1];
          if (type) {
            return TYPE_LABELS[type.toLowerCase()] ?? type;
          }
          const lower = name.trim().toLowerCase();
          const t = cardTypeByName.get(lower);
          if (t) return TYPE_LABELS[t.toLowerCase()] ?? t;
          if (plotNames.has(lower)) return "Plot Essentials";
          return "Other";
        };
        const isArchived = (key) => {
          const parts = key.split("::");
          const name = parts[0] || "";
          const type = parts[1];
          const lookupKey = type ? `${name.trim().toLowerCase()}::${type.toLowerCase()}` : name.trim().toLowerCase();
          return deletedNames.has(lookupKey) || deletedNames.has(name.trim().toLowerCase());
        };
        const activeGrouped = /* @__PURE__ */ new Map();
        const archivedGrouped = /* @__PURE__ */ new Map();
        activeGrouped.set("Plot Essentials", []);
        for (const entry of sortedChars) {
          const lbl = typeLabelFor(entry[0]);
          const target = isArchived(entry[0]) ? archivedGrouped : activeGrouped;
          const arr = target.get(lbl) ?? [];
          arr.push(entry);
          target.set(lbl, arr);
        }
        const LABEL_ORDER = ["Plot Essentials", "Characters", "Classes", "Races", "Locations", "Factions"];
        const rank = (l) => l === "Other" ? 1e3 : LABEL_ORDER.indexOf(l) === -1 ? 500 : LABEL_ORDER.indexOf(l);
        const orderLabels = (keys) => [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
        const openGroups = /* @__PURE__ */ new Set();
        const hasExistingGroups = results.querySelectorAll("details[data-group]").length > 0;
        if (!hasExistingGroups) {
          openGroups.add("active-Plot Essentials");
        } else {
          results.querySelectorAll("details[data-group]").forEach((d) => {
            if (d.open) openGroups.add(d.getAttribute("data-group") || "");
          });
        }
        const renderChars = (groupChars, isArchivedSection = false) => {
          let out = "";
          for (const [key, list] of groupChars) {
            const parts = key.split("::");
            const displayName = parts[0] || "";
            const type = parts[1];
            const charPending = list.filter((v) => v.status === "pending");
            const charApplied = list.filter((v) => v.status === "applied");
            const hasPending = charPending.length > 0;
            const isCharOpen = hasPending ? " open" : "";
            const stateStyles = hasPending ? "border-color:rgba(239, 68, 68, 0.25);background:rgba(239, 68, 68, 0.05);" : isArchivedSection ? "opacity:0.7;" : "";
            const titleColor = hasPending ? "color:#fca5a5;" : isArchivedSection ? "color:var(--text-secondary);" : "";
            let actionText = "";
            const isProtagonist = state.protagonist && displayName.trim().toLowerCase() === state.protagonist.trim().toLowerCase();
            if (!isProtagonist && charApplied.length > 0) {
              const latest = charApplied[charApplied.length - 1];
              if (latest && latest.actionCount != null) {
                actionText = ` <span style="color:var(--text-secondary);font-size:10.5px;font-weight:normal;margin-left:4px;">(Last Updated: Action #${latest.actionCount})</span>`;
              }
            }
            out += `<details class="char-card"${isCharOpen}${stateStyles ? ` style="${stateStyles}"` : ""}><summary${titleColor ? ` style="${titleColor}"` : ""}><span>${esc(displayName)}${actionText}` + (hasPending ? ` <span style="background:rgba(239, 68, 68, 0.2);color:#fca5a5;font-size:9px;padding:2px 6px;border-radius:4px;margin-left:6px;display:inline-block;vertical-align:middle;font-weight:bold;">Proposal</span>` : "") + (isArchivedSection ? ` <span style="background:rgba(255, 255, 255, 0.06);color:var(--text-secondary);font-size:9px;padding:2px 6px;border-radius:4px;margin-left:6px;display:inline-block;vertical-align:middle;">Archived</span>` : "") + `</span></summary><div class="char-card-body">`;
            const lookupKey = type ? `${displayName.trim().toLowerCase()}::${type.toLowerCase()}` : displayName.trim().toLowerCase();
            const genCardId = cardIdByName.get(lookupKey) ?? cardIdByName.get(displayName.trim().toLowerCase());
            if (genCardId && !isArchivedSection) {
              const providerKey = state.settings?.provider || "claude";
              let providerLabel = "Claude";
              if (providerKey === "openai") providerLabel = "OpenAI";
              else if (providerKey === "gemini") providerLabel = "Gemini";
              else if (providerKey === "ollama") providerLabel = "Ollama";
              out += `<button class="action-btn" data-gen-card="${esc(genCardId)}" style="margin-bottom:8px;background:rgba(245,158,11,0.12);color:#fbbf24;border-color:rgba(245,158,11,0.3);">\u26A1 Generate (${providerLabel})</button>`;
            }
            if (hasPending) {
              out += `<div class="pending-proposal-box"><div class="pending-title">Pending Proposal</div>` + charPending.map((v) => {
                const actionText2 = v.actionCount != null ? ` (Action ${v.actionCount})` : "";
                return `<div><div class="pending-summary">${esc(v.changeSummary)}${actionText2}</div><details class="char-section"><summary>view proposed entry</summary><div class="char-section-body"><div class="code-card" style="border-color:rgba(239, 68, 68, 0.25);border-left-color:rgba(239, 68, 68, 0.5);margin:0;"><div class="code-card-header" style="color:#fca5a5;border-color:rgba(239, 68, 68, 0.15);">Proposed: ${esc(v.changeSummary)}${actionText2}</div><pre style="color:#fdd;">${esc(v.entry)}</pre></div></div></details><div style="margin-top:8px;"><button class="action-btn" data-vid="${esc(v.id)}" data-act="applied" style="background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);margin-right:6px;">Accept</button><button class="action-btn" data-vid="${esc(v.id)}" data-act="rejected" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border-color:rgba(239, 68, 68, 0.3);">Reject</button></div></div>`;
              }).join("") + `</div>`;
            }
            if (charApplied.length > 0) {
              const latest = charApplied[charApplied.length - 1];
              const actionText2 = latest.actionCount != null ? ` (Last Updated Action: #${latest.actionCount})` : "";
              out += `<details class="char-section"><summary>Current Entry${actionText2}</summary><div class="char-section-body"><div class="code-card" style="margin:0;"><div class="code-card-header">Latest: ${esc(latest.changeSummary)}</div><pre>${esc(latest.entry)}</pre></div></div></details>`;
              if (genCardId && !isArchivedSection) {
                const card = state.cards?.find((c) => c.id === genCardId);
                const currentTriggers = card?.keys || "";
                out += `<div class="triggers-section" style="margin-top:10px;margin-bottom:10px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;"><label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;display:block;margin-bottom:4px;">Triggers</label><div style="display:flex;gap:6px;align-items:center;"><input class="triggers-input" data-card-id="${esc(genCardId)}" type="text" value="${esc(currentTriggers)}" style="margin:0;flex:1;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:5px 8px;border-radius:6px;font-size:11px;font-family:inherit;box-sizing:border-box;" /><button class="triggers-submit-btn" data-card-id="${esc(genCardId)}" style="margin:0;padding:5px 8px;background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;width:24px;height:24px;" title="Save Triggers">\u2713</button></div></div>`;
                out += `<div class="entry-section" style="margin-top:10px;margin-bottom:10px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;"><label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;display:block;margin-bottom:4px;">Entry</label><div style="display:flex;gap:6px;align-items:flex-start;"><textarea class="entry-input" data-card-id="${esc(genCardId)}" rows="5" style="margin:0;flex:1;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:5px 8px;border-radius:6px;font-size:11px;font-family:SFMono-Regular,Consolas,monospace;box-sizing:border-box;resize:vertical;">${esc(card?.value || "")}</textarea><button class="entry-submit-btn" data-card-id="${esc(genCardId)}" style="margin:0;padding:5px 8px;background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;width:24px;height:24px;" title="Save Entry">\u2713</button></div></div>`;
              }
              out += `<div class="history-header">History & Rewrites</div><div class="history-list">` + [...charApplied].reverse().map((v) => {
                const time = new Date(v.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const actionText3 = v.actionCount != null ? ` (Action #${v.actionCount})` : "";
                const isBaseline = v.changeSummary.startsWith("Baseline");
                const summaryHeader = isBaseline ? `${esc(v.changeSummary)}${actionText3}` : `Action #${v.actionCount ?? "##"}`;
                return `<details class="history-item"><summary>${summaryHeader}</summary><div class="history-detail-body"><div class="history-meta"><span>${esc(v.changeSummary)}</span><span class="note">(${time})</span></div><details class="view-entry-detail"><summary>view entry</summary><div class="code-card" style="margin:4px 0 0;"><pre>${esc(v.entry)}</pre></div></details><div style="margin-top:4px;">` + (v.pushedAt ? `<span class="note" style="color:var(--accent-color);font-weight:600;">\u2713 Pushed to AID</span>` : `<button class="action-btn" data-vid="${esc(v.id)}" data-act="push">\u2B06 Apply to AID</button>`) + `</div></div></details>`;
              }).join("") + `</div>`;
            } else if (charPending.length === 0) {
              out += `<div class="note">No entries recorded.</div>`;
            }
            out += `</div></details>`;
          }
          return out;
        };
        const renderSection = (grouped, sectionPrefix, isArchivedSection = false) => {
          let sectionHtml = "";
          for (const lbl of orderLabels(grouped.keys())) {
            const groupKey = `${sectionPrefix}-${lbl}`;
            const chars = grouped.get(lbl);
            const wasOpen = openGroups.has(groupKey);
            const charCount = chars.length;
            const pendingCount2 = chars.reduce((sum, [, vs]) => sum + vs.filter((v) => v.status === "pending").length, 0);
            const openAttr = wasOpen ? " open" : "";
            const pendingBadge = pendingCount2 > 0 ? ` <span class="badge-new-proposals">+${pendingCount2}</span>` : "";
            const countBadge = ` <span style="color:var(--text-secondary);font-size:10px;font-weight:normal;">(${charCount})</span>`;
            if (lbl === "Characters" && !isArchivedSection) {
              console.log("[AID panel] Characters group names:", chars.map((c) => c[0]));
            }
            let prefixHtml = "";
            if (lbl === "Plot Essentials" && !isArchivedSection) {
              const lookbackVal = state.settings?.analyzeWindow ?? 20;
              const curAction2 = state.actionCount ?? state.actionsCount ?? 0;
              const lastAnAction = state.lastAnalysisAction ?? 0;
              const sinceLastUpdate = lastAnAction > 0 ? String(curAction2 - lastAnAction) : "-";
              prefixHtml = `<button id="an" style="width:100%;margin-bottom:6px;">\u27F3 Update Plot Essentials</button><div style="font-size:9.5px;color:var(--text-secondary);margin-bottom:10px;text-align:center;font-family:SFMono-Regular,Consolas,monospace;display:flex;justify-content:space-around;gap:8px;box-sizing:border-box;width:100%;"><div>Since Last Update Check: <span id="stat-since" style="color:var(--accent-color);font-weight:bold;">${sinceLastUpdate}</span></div><div>Action Lookback Window: <span id="stat-lookback" style="color:var(--accent-color);font-weight:bold;">${lookbackVal}</span></div></div>`;
            }
            const hasPending = pendingCount2 > 0;
            const proposalsClass = hasPending ? " has-proposals" : "";
            sectionHtml += `<details class="group-header${proposalsClass}" data-group="${esc(groupKey)}"${openAttr}><summary><span>${esc(lbl)}${countBadge}${pendingBadge}</span></summary><div style="padding:4px 8px 8px;">` + prefixHtml + renderChars(chars, isArchivedSection) + `</div></details>`;
          }
          return sectionHtml;
        };
        html += renderSection(activeGrouped, "active");
        if (archivedGrouped.size > 0) {
          const totalArchived = [...archivedGrouped.values()].reduce((s, arr) => s + arr.length, 0);
          const archiveGroupKey = "archive-section";
          const wasArchiveOpen = openGroups.has(archiveGroupKey);
          html += `<details class="archive-header" data-group="${archiveGroupKey}"${wasArchiveOpen ? " open" : ""}><summary><span>\u{1F4E6} Archived <span style="font-weight:normal;font-size:10px;">(${totalArchived} card${totalArchived === 1 ? "" : "s"})</span></span></summary><div style="padding:4px 8px 8px;"><div class="note" style="margin-bottom:6px;">Cards deleted from AID but preserved here with their history.</div>` + renderSection(archivedGrouped, "archived", true) + `</div></details>`;
        }
        setSafeHTML(results, html);
        const bannersContainer = root.getElementById("location-banners-container");
        const locationCards = (state.cards ?? []).filter(
          (c) => !c.deletedAt && c.type.toLowerCase() === "location"
        );
        const pendingSuggestions = (state.locationSuggestions ?? []).filter((s) => s.status === "pending");
        let bannersHtml = "";
        if (locationCards.length > 0) {
          const activeId = state.activeLocationId || "";
          bannersHtml += `
          <div class="location-manager-banner" style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:8px;padding:8px 10px;margin-bottom:8px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:700;color:var(--theme-text-color);font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Active Location Manager</span>
              ${activeId ? `<button id="clear-active-location" style="margin:0;padding:2px 6px;font-size:9.5px;background:rgba(239,68,68,0.1);color:#fca5a5;border:1px solid rgba(239,68,68,0.2);border-radius:4px;cursor:pointer;">Clear</button>` : ""}
            </div>
            <select id="active-location-select" style="margin:2px 0 0 0;padding:4px 8px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);width:100%;">
              <option value="" ${!activeId ? "selected" : ""}>-- Select Active Location --</option>
              ${locationCards.map((c) => `
                <option value="${esc(c.id)}"${c.id === activeId ? " selected" : ""}>${esc(c.title || c.keys)}</option>
              `).join("")}
            </select>
          </div>
        `;
        }
        if (pendingSuggestions.length > 0) {
          const sug = pendingSuggestions[0];
          const properNoun = sug.properNoun;
          const defaultTypes = /* @__PURE__ */ new Set(["character", "location", "faction", "class", "race", "memory"]);
          const existingCustomTypes = Array.from(new Set(
            (state.cards ?? []).filter((c) => c.type && !defaultTypes.has(c.type.toLowerCase())).map((c) => c.type)
          ));
          bannersHtml += `
          <div class="location-suggestion-banner" style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.20);border-radius:8px;padding:10px;margin-bottom:8px;display:flex;flex-direction:column;gap:8px;box-sizing:border-box;">
            <div style="font-weight:700;color:var(--theme-text-color);font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">New Noun Detected: "${esc(properNoun)}"</div>
            <div class="note" style="margin:0;font-size:11.5px;line-height:1.4;">Detected in action: <em>"${esc(sug.actionText)}"</em></div>
            
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="display:flex;gap:6px;align-items:center;">
                <label style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">This is a:</label>
                <select id="suggestion-type-select" style="padding:4px 6px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);flex-grow:1;">
                  <option value="character">Character</option>
                  <option value="location">Location</option>
                  <option value="faction">Faction</option>
                  <option value="class">Class</option>
                  <option value="race">Race</option>
                  <option value="custom">Custom...</option>
                </select>
                
                <input type="text" id="suggestion-custom-type-input" list="existing-custom-types" placeholder="Enter type..." style="display:none;padding:4px 6px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);width:100px;box-sizing:border-box;" />
                
                <datalist id="existing-custom-types">
                  ${existingCustomTypes.map((t) => `<option value="${esc(t)}"></option>`).join("")}
                </datalist>
              </div>
            </div>
            
            <div style="display:flex;gap:6px;margin-top:2px;">
              <button id="sug-accept-btn" style="background:rgba(16,185,129,0.15);color:#34d399;border-color:rgba(16,185,129,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;">Add Card</button>
              <button id="sug-ignore-btn" style="background:rgba(239,68,68,0.15);color:#fca5a5;border-color:rgba(239,68,68,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;">Ignore</button>
            </div>

            <div style="display:flex;gap:6px;align-items:center;margin-top:2px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
              <label style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">Already tracked?</label>
              <select id="sug-link-select" style="padding:4px 6px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);flex-grow:1;min-width:0;">${buildCardPickerOptions(state.cards)}</select>
              <button id="sug-link-btn" style="background:rgba(59,130,246,0.15);color:#93c5fd;border-color:rgba(59,130,246,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;white-space:nowrap;">Link</button>
            </div>
          </div>
        `;
        }
        if (bannersContainer) {
          setSafeHTML(bannersContainer, bannersHtml);
          const selectEl = root.getElementById("active-location-select");
          selectEl?.addEventListener("change", () => {
            const cardId = selectEl.value || null;
            if (setActiveLocationCb) {
              setActiveLocationCb(cardId);
            }
          });
          const clearBtn = root.getElementById("clear-active-location");
          clearBtn?.addEventListener("click", () => {
            if (setActiveLocationCb) {
              setActiveLocationCb(null);
            }
          });
          const sugTypeSelect = root.getElementById("suggestion-type-select");
          const sugCustomInput = root.getElementById("suggestion-custom-type-input");
          sugTypeSelect?.addEventListener("change", () => {
            if (sugCustomInput) {
              sugCustomInput.style.display = sugTypeSelect.value === "custom" ? "inline-block" : "none";
              if (sugTypeSelect.value === "custom") {
                sugCustomInput.focus();
              }
            }
          });
          const acceptBtn = root.getElementById("sug-accept-btn");
          acceptBtn?.addEventListener("click", () => {
            if (!pendingSuggestions.length) return;
            const sug = pendingSuggestions[0];
            let selectedType = sugTypeSelect?.value || "character";
            if (selectedType === "custom") {
              selectedType = sugCustomInput?.value.trim() || "custom";
            }
            if (respondToProperNounSuggestionCb) {
              respondToProperNounSuggestionCb(sug.properNoun, true, selectedType);
            }
          });
          const ignoreBtn = root.getElementById("sug-ignore-btn");
          ignoreBtn?.addEventListener("click", () => {
            if (!pendingSuggestions.length) return;
            const sug = pendingSuggestions[0];
            if (respondToProperNounSuggestionCb) {
              respondToProperNounSuggestionCb(sug.properNoun, false, "character");
            }
          });
          const linkSelect = root.getElementById("sug-link-select");
          const linkBtn = root.getElementById("sug-link-btn");
          linkBtn?.addEventListener("click", () => {
            if (!pendingSuggestions.length) return;
            const cardId = linkSelect?.value || "";
            if (!cardId) {
              showToast("Pick a card to link to", true);
              return;
            }
            const sug = pendingSuggestions[0];
            if (linkProperNounToCardCb) {
              linkProperNounToCardCb(sug.properNoun, cardId);
            }
          });
        }
        const pnLogsList = root.getElementById("pn-logs-list");
        if (pnLogsList && state.properNounLogs) {
          if (state.properNounLogs.length === 0) {
            setSafeHTML(pnLogsList, `<div class="note" style="text-align:center;padding:10px 0;">No proper noun logs recorded.</div>`);
          } else {
            const linkPickerOptions = buildCardPickerOptions(state.cards);
            let pnLogsHtml = "";
            for (const log of state.properNounLogs) {
              const selectedType = log.type || (log.isLocation ? "location" : log.isCharacter ? "character" : "");
              const linkedTag = log.linkedCardTitle ? ` <span style="color:#93c5fd;font-size:9.5px;white-space:nowrap;" title="Linked to ${esc(log.linkedCardTitle)}">\u2192 ${esc(log.linkedCardTitle)}</span>` : "";
              pnLogsHtml += `
              <div class="pn-log-item" data-pn="${esc(log.properNoun)}" style="display:flex;flex-direction:column;gap:4px;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span style="display:flex;align-items:center;gap:4px;overflow:hidden;min-width:0;">
                    <span style="font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;" title="${esc(log.properNoun)}">${esc(log.properNoun)}</span>${linkedTag}
                  </span>
                  <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                    <select class="pn-log-select" style="margin:0;padding:2px 4px;font-size:10px;width:auto;max-width:120px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">${buildTypePickerOptions(state.cards, selectedType)}</select>
                    <button class="pn-log-link-btn" style="margin:0;padding:2px 4px;background:none;border:none;cursor:pointer;color:var(--text-secondary);" title="Link to existing card">\u{1F517}</button>
                    <button class="pn-log-del-btn" style="margin:0;padding:2px 4px;background:none;border:none;cursor:pointer;color:var(--text-secondary);" title="Delete Log">\u{1F5D1}</button>
                  </div>
                </div>
                <div class="pn-log-link-row" style="display:none;gap:4px;align-items:center;">
                  <select class="pn-log-link-select" style="margin:0;padding:2px 4px;font-size:10.5px;flex-grow:1;min-width:0;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">${linkPickerOptions}</select>
                </div>
              </div>
            `;
            }
            setSafeHTML(pnLogsList, pnLogsHtml);
            pnLogsList.querySelectorAll(".pn-log-select").forEach((sel) => {
              sel.addEventListener("change", () => {
                const item = sel.closest(".pn-log-item");
                const pn = item?.getAttribute("data-pn") || "";
                const val = sel.value;
                if (updateProperNounLogCb) {
                  updateProperNounLogCb(pn, val);
                }
              });
            });
            pnLogsList.querySelectorAll(".pn-log-link-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const item = btn.closest(".pn-log-item");
                const row = item?.querySelector(".pn-log-link-row");
                if (row) row.style.display = row.style.display === "none" ? "flex" : "none";
              });
            });
            pnLogsList.querySelectorAll(".pn-log-link-select").forEach((sel) => {
              sel.addEventListener("change", () => {
                const item = sel.closest(".pn-log-item");
                const pn = item?.getAttribute("data-pn") || "";
                const cardId = sel.value;
                if (cardId && linkProperNounToCardCb) {
                  linkProperNounToCardCb(pn, cardId);
                }
              });
            });
            pnLogsList.querySelectorAll(".pn-log-del-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const item = btn.closest(".pn-log-item");
                const pn = item?.getAttribute("data-pn") || "";
                if (deleteProperNounLogCb) {
                  deleteProperNounLogCb(pn);
                }
              });
            });
          }
        }
        const clearPnLogsBtn = root.getElementById("clear-pn-logs");
        if (clearPnLogsBtn) {
          const newBtn = clearPnLogsBtn.cloneNode(true);
          clearPnLogsBtn.parentNode?.replaceChild(newBtn, clearPnLogsBtn);
          newBtn.addEventListener("click", () => {
            if (clearProperNounLogsCb) {
              clearProperNounLogsCb();
            }
          });
        }
        renderMemoriesSection(state);
        const pendingCount = state.versions.filter((v) => v.status === "pending").length;
        const proposalsBadge = root.getElementById("tracker-proposals-badge");
        if (proposalsBadge) {
          if (activeTabId === "main-tab-tracker") {
            proposalsBadge.style.display = "none";
            proposalsBadge.className = "";
          } else if (pendingCount > 0) {
            proposalsBadge.textContent = `+${pendingCount}`;
            proposalsBadge.style.display = "inline-block";
            proposalsBadge.className = "badge-new-proposals";
          } else {
            proposalsBadge.style.display = "none";
            proposalsBadge.className = "";
          }
        }
        updateMinState();
      }
    };
  }

  // src/content/content.ts
  var activeShortId = null;
  var autoBackfillsInFlight = /* @__PURE__ */ new Set();
  function checkIsPlayUrl() {
    return location.pathname === "/play" || location.pathname.endsWith("/play") || location.pathname.startsWith("/play/") || location.pathname.startsWith("/adventure/") || location.pathname.startsWith("/scenario/");
  }
  function currentShortId() {
    const isPlayUrl = checkIsPlayUrl();
    const m = location.pathname.match(/\/play\/([^/]+)/) || location.pathname.match(/\/adventure\/([^/]+)/) || location.pathname.match(/\/scenario\/([^/]+)/);
    if (m) return m[1];
    const params = new URLSearchParams(location.search);
    const qId = params.get("adventureId") || params.get("adventure") || params.get("scenarioId") || params.get("scenario") || params.get("id");
    if (qId) return qId;
    if (isPlayUrl) {
      return activeShortId;
    }
    return null;
  }
  var panel = mountPanel();
  panel.onRefresh(() => {
    dlog("[AID content] Direct refresh requested by panel callback");
    refresh();
  });
  panel.onBackupAll(async () => {
    return browser.runtime.sendMessage({ kind: "exportAll" });
  });
  panel.onRestoreAll(async (data) => {
    const res = await browser.runtime.sendMessage({ kind: "importAll", data });
    refresh();
    return res;
  });
  panel.onSaveCardValue(async (cardId, value) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure." };
    const res = await browser.runtime.sendMessage({ kind: "saveCardValue", shortId: sid, cardId, value });
    refresh();
    return res;
  });
  var count = 0;
  var debugEnabled = false;
  var _log = console.log.bind(console);
  function dlog(...args) {
    if (debugEnabled) _log(...args);
  }
  function send(msg) {
    browser.runtime.sendMessage(msg).catch(() => {
    });
  }
  var actionUpdateTimeout = null;
  var accumulatedActions = [];
  var lastActionPayload = null;
  function bufferActionUpdate(sid, payload) {
    if (payload?.actions) {
      accumulatedActions.push(...payload.actions);
      lastActionPayload = payload;
    }
    if (actionUpdateTimeout) {
      clearTimeout(actionUpdateTimeout);
    }
    actionUpdateTimeout = setTimeout(() => {
      if (accumulatedActions.length > 0 && lastActionPayload) {
        dlog(`[AID content] Sending debounced actionUpdate with ${accumulatedActions.length} actions.`);
        send({
          kind: "actionUpdate",
          shortId: sid,
          payload: {
            ...lastActionPayload,
            actions: accumulatedActions
          }
        });
        accumulatedActions = [];
        lastActionPayload = null;
        browser.runtime.sendMessage({ kind: "getState", shortId: sid }).then((state) => {
          if (state) {
            panel.updateActionCount(
              state.actionCount ?? state.actionsCount ?? 0,
              state.lastAnalysisAction ?? null
            );
          }
        }).catch(() => {
        });
      }
    }, 250);
  }
  var memoriesUpdateTimeout = null;
  var latestMemories = [];
  function bufferMemoriesUpdate(sid, memories) {
    latestMemories = memories;
    if (memoriesUpdateTimeout) {
      clearTimeout(memoriesUpdateTimeout);
    }
    memoriesUpdateTimeout = setTimeout(() => {
      dlog(`[AID content] Sending debounced adventureMemories with ${latestMemories.length} memories.`);
      send({
        kind: "adventureMemories",
        shortId: sid,
        memories: latestMemories
      });
      panel.updateMemories(latestMemories);
      latestMemories = [];
    }, 250);
  }
  async function refreshModels(current) {
    const res = await browser.runtime.sendMessage({ kind: "listModels" });
    panel.setModels(res?.models ?? [], current);
  }
  async function refresh() {
    const sid = currentShortId();
    const isPlayUrl = checkIsPlayUrl();
    if (sid && isPlayUrl) {
      const state = await browser.runtime.sendMessage({ kind: "getState", shortId: sid });
      if (state) {
        debugEnabled = !!state.settings?.showDebug;
        panel.render({
          shortId: state.shortId || sid,
          protagonist: state.protagonist,
          scenario: state.scenario ?? null,
          settings: state.settings,
          versions: state.versions ?? [],
          cards: state.cards ?? [],
          allCards: state.allCards ?? [],
          adventures: state.adventures ?? [],
          globalAssets: state.globalAssets ?? [],
          memory: state.memory ?? null,
          actionsCount: state.actionsCount,
          actionCount: state.actionCount,
          lastAnalysisAction: state.lastAnalysisAction,
          aidMemories: state.aidMemories ?? [],
          ops: state.ops ?? [],
          activeLocationId: state.activeLocationId ?? null,
          locationSuggestions: state.locationSuggestions ?? [],
          properNounLogs: state.properNounLogs ?? [],
          isManagerOnly: false
        });
        refreshModels(state.settings?.model);
        window.postMessage({
          source: "aid-extension-host",
          kind: "settingsUpdate",
          interceptTimeout: state.settings?.interceptTimeout ?? 10,
          debug: !!state.settings?.showDebug
        }, location.origin);
      }
    } else {
      const state = await browser.runtime.sendMessage({ kind: "getManagerData" });
      if (state) {
        panel.render({
          isManagerOnly: true,
          adventures: state.adventures,
          cards: state.cards,
          globalAssets: state.globalAssets,
          settings: state.settings,
          versions: [],
          protagonist: null
        });
      }
    }
  }
  var lastShortId = null;
  var lastPath = null;
  var lastDocTitle = null;
  var checkNavigationInterval = null;
  function checkNavigation() {
    if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.id) {
      if (checkNavigationInterval) {
        clearInterval(checkNavigationInterval);
      }
      return;
    }
    const sid = currentShortId();
    const path = location.pathname;
    const docTitle = document.title;
    const isNavChanged = sid !== lastShortId || path !== lastPath;
    const isTitleChanged = docTitle !== lastDocTitle;
    if (isNavChanged || isTitleChanged) {
      lastShortId = sid;
      lastPath = path;
      lastDocTitle = docTitle;
      if (sid) {
        const isGeneric = !docTitle || docTitle === "AI Dungeon" || docTitle === "Untitled Adventure";
        if (isNavChanged || !isGeneric) {
          send({ kind: "adventureMeta", shortId: sid, title: isGeneric ? void 0 : docTitle });
        }
        if (isNavChanged) {
          browser.runtime.sendMessage({ kind: "getState", shortId: sid }).then((state) => {
            if (state && Array.isArray(state.cards)) {
              window.postMessage({
                source: "aid-extension-host",
                kind: "seedApprovedCards",
                cards: state.cards.map((card) => ({
                  id: card.id,
                  value: card.value,
                  description: card.description || ""
                }))
              }, location.origin);
            }
          }).catch(() => {
          });
        }
      }
      refresh();
    }
  }
  checkNavigationInterval = setInterval(checkNavigation, 1e3);
  checkNavigation();
  window.addEventListener("message", (ev) => {
    if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.id) return;
    if (ev.source !== window || ev.data?.source !== "aid-tracker") return;
    const detail = ev.data.detail;
    if (detail?.transport === "adventureLoaded") {
      const { shortId, title, memory, authorsNote, instructions, storyCards } = detail;
      activeShortId = shortId;
      browser.runtime.sendMessage({ kind: "getState", shortId }).then((state) => {
        if (state && Array.isArray(state.cards)) {
          window.postMessage({
            source: "aid-extension-host",
            kind: "seedApprovedCards",
            cards: state.cards.map((card) => ({
              id: card.id,
              value: card.value,
              description: card.description || ""
            }))
          }, location.origin);
        }
        const hasAdventure = state && Array.isArray(state.adventures) && state.adventures.some((a) => a.shortId === shortId);
        const isSkeleton = hasAdventure && (!state.actionCount || state.actionCount === 0);
        if ((!hasAdventure || isSkeleton) && !autoBackfillsInFlight.has(shortId)) {
          autoBackfillsInFlight.add(shortId);
          console.log(`[AID content] Auto-triggering backfill for new/skeleton adventure: ${shortId}`);
          browser.runtime.sendMessage({ kind: "backfillRequest", shortId }).then((res) => {
            console.log(`[AID content] Auto-backfill completed for ${shortId}:`, res);
            refresh();
          }).catch((err) => {
            console.error(`[AID content] Auto-backfill failed for ${shortId}:`, err);
          }).finally(() => {
            autoBackfillsInFlight.delete(shortId);
          });
        }
      }).catch(() => {
      });
      if (title || memory || authorsNote !== void 0 || instructions !== void 0) {
        send({ kind: "adventureMeta", shortId, title, memory, authorsNote, instructions });
      }
      if (Array.isArray(storyCards)) {
        const cards = storyCards.map((c) => ({
          shortId,
          id: c.id,
          type: c.type,
          title: c.title,
          keys: c.keys,
          value: c.value,
          description: c.description || "",
          deletedAt: c.deletedAt ?? null
        }));
        send({ kind: "cardsUpdate", shortId, cards });
      }
      if (memory) {
        const m = memory.match(/(?:your name|player name)\s*:\s*([^\n\]]+)/i);
        const protagonistName = m ? m[1].trim() : null;
        if (protagonistName) {
          send({ kind: "setProtagonist", shortId, name: protagonistName });
        }
      }
      refresh();
      return;
    }
    if (detail?.transport === "interceptedAction") {
      browser.runtime.sendMessage({
        kind: "processInterceptedAction",
        shortId: detail.shortId,
        text: detail.text,
        type: detail.type
      }).then((res) => {
        window.postMessage({
          source: "aid-extension-host",
          kind: "actionApproved",
          requestId: detail.requestId,
          updatedNames: res?.updatedNames || []
        }, location.origin);
      }).catch((err) => {
        console.error("[AID content] Error processing intercepted action:", err);
        window.postMessage({
          source: "aid-extension-host",
          kind: "actionApproved",
          requestId: detail.requestId,
          updatedNames: []
        }, location.origin);
      });
      return;
    }
    if (detail?.transport === "auth" && detail.token) {
      send({ kind: "authToken", token: detail.token });
      return;
    }
    if (detail?.transport === "op" && Array.isArray(detail.ops)) {
      send({ kind: "learnedOp", ops: detail.ops, endpoint: detail.url });
      return;
    }
    const sid = currentShortId();
    if (!sid) return;
    if (detail?.transport === "ws") {
      dlog("[AID content] Received WS message from page:", detail.operationName, "active sid:", sid);
    }
    if (detail?.transport === "ws" && detail.operationName === "ActionUpdates") {
      const payload = detail.data?.actionUpdates;
      if (payload?.actions) {
        count += payload.actions.length;
        bufferActionUpdate(sid, payload);
      }
      return;
    }
    if (detail?.transport === "ws" && detail.operationName === "AdventureMetadataUpdate") {
      const title = detail.data?.adventureMetadataUpdate?.title;
      if (title) send({ kind: "adventureMeta", shortId: sid, title });
      return;
    }
    if (detail?.transport === "ws" && detail.operationName === "AdventureStoryCardsUpdate") {
      const raw = detail.data?.adventureStoryCardsUpdate?.storyCards;
      if (Array.isArray(raw)) {
        const cards = raw.map((c) => ({ shortId: sid, id: c.id, type: c.type, title: c.title, keys: c.keys, value: c.value, description: c.description || "", deletedAt: c.deletedAt ?? null }));
        send({ kind: "cardsUpdate", shortId: sid, cards });
      }
      return;
    }
    if (detail?.transport === "cardWrites" && Array.isArray(detail.cards)) {
      const cards = detail.cards.filter((c) => c && c.id && (!c.shortId || c.shortId === sid)).map((c) => ({
        shortId: sid,
        id: String(c.id),
        type: c.type || "custom",
        title: c.title,
        keys: c.keys || "",
        value: c.value || "",
        description: c.description || "",
        deletedAt: null
      }));
      if (cards.length) {
        dlog("[AID content] Captured page card writes:", cards.map((c) => c.title || c.id).join(", "));
        send({ kind: "cardsUpdate", shortId: sid, cards });
      }
      return;
    }
    if (detail?.transport === "ws" && detail.operationName === "Memory") {
      const memory = detail.data?.memory?.memory;
      if (memory) {
        dlog("[AID content] Captured real-time memory from WebSocket subscription:", memory.length);
        send({ kind: "adventureMeta", shortId: sid, memory });
      }
      return;
    }
    if (detail?.transport === "ws" && detail.operationName === "AdventureMemoriesUpdate") {
      const memories = detail.data?.adventureMemoriesUpdate?.memories;
      if (Array.isArray(memories)) {
        dlog("[AID content] Captured real-time adventure memories update. count:", memories.length);
        bufferMemoriesUpdate(sid, memories || []);
      }
      return;
    }
  });
  panel.onExport(async (type) => {
    const sid = currentShortId();
    if (!sid) return;
    const backup = await browser.runtime.sendMessage({ kind: "exportRequest", shortId: sid });
    if (backup == null) {
      panel.showToast("Nothing to export yet", true);
      return;
    }
    let blob;
    let filename;
    if (type === "story") {
      const actions = backup.actions || [];
      blob = new Blob([JSON.stringify(actions, null, 2)], { type: "application/json" });
      filename = `aid-story-${sid}.json`;
    } else if (type === "cards") {
      const cards = backup.cards || [];
      blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
      filename = `aid-storycards-${sid}.json`;
    } else if (type === "pe") {
      const memory = backup.adventure?.memory || "";
      blob = new Blob([memory], { type: "text/plain" });
      filename = `aid-pe-${sid}.txt`;
    } else if (type === "aidmemories") {
      const aidMemories = backup.adventure?.aidMemories || [];
      blob = new Blob([JSON.stringify(aidMemories, null, 2)], { type: "application/json" });
      filename = `aid-memories-${sid}.json`;
    } else if (type === "propernouns") {
      const logs = backup.adventure?.properNounLogs || [];
      blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
      filename = `aid-propernouns-${sid}.json`;
    } else {
      blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      filename = `aid-all-${sid}.json`;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    panel.showToast("Data exported successfully!");
    setTimeout(() => URL.revokeObjectURL(a.href), 5e3);
  });
  panel.onBackfill(async () => {
    const sid = currentShortId();
    if (!sid) return;
    panel.setStatus(`Backfilling story\u2026`);
    try {
      const res = await browser.runtime.sendMessage({ kind: "backfillRequest", shortId: sid });
      if (res && typeof res.loaded === "number") {
        panel.setStatus(`Backfilled ${res.loaded} actions`);
        panel.showToast("Backfill complete!");
      } else {
        panel.setStatus(`${res?.error ?? "Backfill failed"}`);
        panel.showToast("Backfill failed!", true);
      }
    } catch (err) {
      console.error("[AID content] Backfill request failed:", err);
      panel.setStatus(`Backfill failed: ${err?.message || err}`);
      panel.showToast("Backfill failed!", true);
    }
    refresh();
  });
  panel.onSaveSettings(async (provider, apiKey, protagonist, model, analyzeWindow, showDebug, theme, s1, s2, s3, s4, cardCommands, useMemories, formattingMode, memoraidLookback, memoraidThoughtLookback, memoraidPresenceLookback, autoRegenerateNativeMemories, interceptTimeout, useSinglePassGeneration, locationMode, enableProperNounDetection, manualMode, logPlotEssentials, characterCardLimit, thoughtCardLimit) => {
    const sid = currentShortId();
    if (!sid) return;
    const settings = {
      provider,
      model: model || void 0,
      analyzeWindow,
      showDebug,
      theme,
      customPromptSection1: s1,
      customPromptSection2: s2,
      customPromptSection3: s3,
      customPromptSection4: s4,
      cardCommands,
      formattingMode,
      useMemories,
      memoraidLookback,
      memoraidThoughtLookback,
      memoraidPresenceLookback,
      autoRegenerateNativeMemories,
      interceptTimeout,
      useSinglePassGeneration,
      locationMode,
      enableProperNounDetection,
      manualMode,
      logPlotEssentials,
      characterCardLimit,
      thoughtCardLimit
    };
    if (apiKey) settings.apiKeys = { [provider]: apiKey };
    await browser.runtime.sendMessage({ kind: "setSettings", settings });
    if (protagonist) await browser.runtime.sendMessage({ kind: "setProtagonist", shortId: sid, name: protagonist });
    window.postMessage({
      source: "aid-extension-host",
      kind: "settingsUpdate",
      interceptTimeout,
      debug: !!showDebug
    }, location.origin);
    panel.showToast("Settings saved!");
    refreshModels(model || void 0);
    refresh();
  });
  panel.onThemeChange(async (theme) => {
    const settings = { theme };
    await browser.runtime.sendMessage({ kind: "setSettings", settings });
  });
  panel.onDismissMemoraidBanner(async () => {
    await browser.runtime.sendMessage({ kind: "setSettings", settings: { memoraidBannerDismissed: true } });
    refresh();
  });
  panel.onProviderChange(async (provider, apiKey) => {
    const res = await browser.runtime.sendMessage({
      kind: "listModels",
      provider,
      apiKey: apiKey || void 0
    });
    const models = res?.models ?? [];
    panel.setModels(models, models[0] || void 0);
  });
  panel.onAnalyze(async () => {
    const sid = currentShortId();
    if (!sid) return;
    const res = await browser.runtime.sendMessage({ kind: "analyzeRequest", shortId: sid });
    panel.showAnalyzeResult(res);
    if (res?.error) panel.showToast("Update failed!", true);
    await refresh();
    panel.showDebug(res?.debug);
  });
  panel.onGenerateCard(async (cardId) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.showToast("Generating via AI Dungeon\u2026");
    const res = await browser.runtime.sendMessage({ kind: "generateCard", shortId: sid, cardId });
    if (res?.error) panel.showToast(`Generate failed: ${res.error}`, true);
    else if (res?.id) panel.showToast(`Proposal ready for ${res.characterName} \u2014 review & approve.`);
    await refresh();
  });
  async function handleSuccessfulPush(res) {
    if (res?.ok && res.source === "card" && res.cardId && typeof res.value === "string") {
      dlog("[AID content] Successful card push detected. Notifying injected script to sync Apollo cache...");
      window.postMessage({
        source: "aid-extension-host",
        kind: "approvedCard",
        cardId: res.cardId,
        value: res.value,
        description: res.description,
        keys: res.keys,
        prevKeys: res.prevKeys
      }, location.origin);
    } else if (res?.ok && res.source === "plot" && typeof res.memory === "string") {
      dlog("[AID content] Successful plot push detected. Notifying injected script to sync Apollo cache...");
      const sid = currentShortId();
      if (sid) {
        window.postMessage({
          source: "aid-extension-host",
          kind: "approvedMemory",
          shortId: sid,
          memory: res.memory
        }, location.origin);
      }
    }
  }
  panel.onProposalDecision(async (id, status) => {
    try {
      const res = await browser.runtime.sendMessage({ kind: "setVersionStatus", id, status });
      if (status === "applied") {
        if (res?.ok) {
          panel.showToast("Approved & pushed to AI Dungeon!");
          await handleSuccessfulPush(res);
        } else {
          panel.showToast(`Approved locally \u2014 push failed: ${res?.error || "unknown error"}`, true);
        }
      }
    } catch (err) {
      panel.showToast(`Approved locally \u2014 push error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.onPushVersion(async (id) => {
    dlog("[AID content] onPushVersion handler triggered for id:", id);
    panel.setStatus("Pushing update to AI Dungeon\u2026");
    try {
      const res = await browser.runtime.sendMessage({ kind: "applyToAid", id });
      dlog("[AID content] applyToAid response received:", res);
      if (res?.ok) {
        panel.setStatus("Push successful!");
        panel.showToast("Push successful!");
        await handleSuccessfulPush(res);
      } else {
        panel.setStatus(`Push failed: ${res?.error || "Unknown error"}`);
        panel.showToast(`Push failed: ${res?.error || "Unknown error"}`, true);
      }
    } catch (err) {
      console.error("[AID content] Error during applyToAid sendMessage:", err);
      panel.setStatus(`Push failed: ${err?.message || err || "Communication error"}`);
      panel.showToast("Communication error!", true);
    }
    refresh();
  });
  panel.onUpdateAidMemories(async (memories) => {
    const sid = currentShortId();
    if (!sid) return;
    await browser.runtime.sendMessage({ kind: "updateAidMemories", shortId: sid, memories });
    refresh();
  });
  panel.onCreateConfigCard(async () => {
    const sid = currentShortId();
    if (!sid) return;
    panel.setStatus("Creating Configure MemorAID card...");
    try {
      const res = await browser.runtime.sendMessage({ kind: "createConfigCard", shortId: sid });
      if (res?.ok) {
        panel.showToast("Configure MemorAID card created! Refreshing...");
      } else {
        panel.showToast(`Creation failed: ${res?.error || "unknown error"}`, true);
      }
    } catch (err) {
      panel.showToast(`Creation error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.onCreateStoryCard(async (card) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    panel.setStatus("Creating story card...");
    try {
      const res = await browser.runtime.sendMessage({ kind: "createStoryCard", shortId: sid, card });
      refresh();
      if (res?.ok) {
        return { ok: true };
      } else {
        return { error: res?.error || "unknown error" };
      }
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.onSaveCardKeys(async (cardId, keys) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    panel.setStatus("Saving card triggers...");
    try {
      const res = await browser.runtime.sendMessage({ kind: "saveCardKeys", shortId: sid, cardId, keys });
      refresh();
      if (res?.ok) {
        return { ok: true };
      } else {
        return { error: res?.error || "unknown error" };
      }
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.onRefineMemoryBlock(async (index) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.setStatus(`Refining memory block #${index + 1}...`);
    try {
      const res = await browser.runtime.sendMessage({ kind: "refineMemoryBlock", shortId: sid, index });
      if (res?.ok) {
        panel.showToast(`Memory block #${index + 1} regenerated and pushed to AID!`);
      } else {
        panel.showToast(`Refinement failed: ${res?.error || "unknown error"}`, true);
      }
    } catch (err) {
      panel.showToast(`Refinement error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.onGrantPermissions(() => {
    panel.showToast("Opening permissions tab...");
    browser.runtime.sendMessage({ kind: "openPermissionsPage" }).then((res) => {
      if (!res || !res.ok) {
        panel.showToast("Failed to open permissions tab: " + (res?.error || "unknown error"), true);
      }
    }).catch((err) => {
      panel.showToast("Failed to open permissions tab: " + err.message, true);
    });
  });
  panel.onSetActiveLocation(async (cardId) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      const res = await browser.runtime.sendMessage({ kind: "setActiveLocation", shortId: sid, cardId });
      if (res?.error) {
        panel.showToast(`Failed to set location: ${res.error}`, true);
      } else {
        panel.showToast(cardId ? "Active location updated." : "Active location cleared.");
      }
    } catch (err) {
      panel.showToast(`Failed to set location: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.onRespondToProperNounSuggestion(async (properNoun, accept, type) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      const res = await browser.runtime.sendMessage({ kind: "respondToProperNounSuggestion", shortId: sid, properNoun, accept, type });
      if (res?.error) {
        panel.showToast(`Suggestion response failed: ${res.error}`, true);
      } else if (accept) {
        panel.showToast(`"${properNoun}" recorded as ${type}.`);
      }
    } catch (err) {
      panel.showToast(`Suggestion response error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.onUpdateProperNounLog(async (properNoun, type) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      await browser.runtime.sendMessage({ kind: "updateProperNounLog", shortId: sid, properNoun, type });
    } catch {
    }
    refresh();
  });
  panel.onLinkProperNounToCard(async (properNoun, cardId) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      const res = await browser.runtime.sendMessage({ kind: "linkProperNounToCard", shortId: sid, properNoun, cardId });
      if (res?.error) {
        panel.showToast(`Link failed: ${res.error}`, true);
      } else {
        panel.showToast(`"${properNoun}" linked to its card.`);
      }
    } catch (err) {
      panel.showToast(`Link error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.onDeleteProperNounLog(async (properNoun) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      await browser.runtime.sendMessage({ kind: "deleteProperNounLog", shortId: sid, properNoun });
    } catch {
    }
    refresh();
  });
  panel.onClearProperNounLogs(async () => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      await browser.runtime.sendMessage({ kind: "clearProperNounLogs", shortId: sid });
      panel.showToast("Proper noun logs cleared.");
    } catch (err) {
      panel.showToast(`Failed to clear logs: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.onApplyInstruction(() => {
    refresh();
  });
  panel.onSaveGlobalAsset(async (asset) => {
    const res = await browser.runtime.sendMessage({ kind: "saveGlobalAsset", asset });
    refresh();
    return res;
  });
  panel.onDeleteGlobalAsset(async (id) => {
    const res = await browser.runtime.sendMessage({ kind: "deleteGlobalAsset", id });
    refresh();
    return res;
  });
  panel.onImportGlobalAsset(async (assetId) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure." };
    const res = await browser.runtime.sendMessage({ kind: "importGlobalAsset", shortId: sid, assetId });
    refresh();
    return res;
  });
  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.kind === "approvedCardSync") {
      handleSuccessfulPush(msg.payload);
      refresh();
      return;
    }
    if (msg && msg.kind === "stateUpdated") {
      dlog(`[AID content] State updated received from background. Refreshing...`);
      if (msg.type && msg.text) {
        window.postMessage({
          source: "aid-extension-host",
          kind: "approvedState",
          shortId: msg.shortId,
          type: msg.type,
          text: msg.text,
          previousText: msg.previousText
        }, location.origin);
      }
      refresh();
      return;
    }
    if (msg && msg.kind === "memoryUpdated") {
      dlog(`[AID content] Memory update received from background. Notifying injected script...`);
      window.postMessage({
        source: "aid-extension-host",
        kind: "approvedMemory",
        shortId: msg.shortId,
        memory: msg.memory,
        previousMemory: msg.previousMemory
      }, location.origin);
      refresh();
      return;
    }
    if (msg && msg.kind === "proposalCreated") {
      dlog(`[AID content] Auto-update proposal created for character: ${msg.characterName}. Refreshing...`);
      refresh();
      return;
    }
    if (msg && msg.kind === "memoraidTiming") {
      panel.updateMemoraidTiming(msg.payload);
      return;
    }
    if (msg && msg.kind === "relayFetch") {
      return new Promise((resolve) => {
        const requestId = Math.random().toString(36).substring(7);
        const listener = (ev) => {
          if (ev.origin !== location.origin || ev.data?.source !== "aid-extension-host") return;
          if (ev.data?.kind === "relayFetchResponse" && ev.data.requestId === requestId) {
            window.removeEventListener("message", listener);
            resolve(ev.data.response);
          }
        };
        window.addEventListener("message", listener);
        window.postMessage({
          source: "aid-extension-host-relay",
          kind: "relayFetchRequest",
          requestId,
          url: msg.url,
          init: msg.init
        }, location.origin);
      });
    }
  });
  window.addEventListener("aid-refresh-panel", () => {
    if (typeof browser === "undefined" || !browser.runtime || !browser.runtime.id) return;
    dlog("[AID content] Direct refresh requested by panel");
    refresh();
  });
})();
