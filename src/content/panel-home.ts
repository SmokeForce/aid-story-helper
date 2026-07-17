/** Home tab render (Mobile Rethink Phase A §2): the pending-decisions queue (the "New Noun
 *  Detected" proper-noun suggestion UI — moved here verbatim from the Cards banners — plus pending
 *  proposal rows) and the recent decided proposals list. The status strip (#home-status) is static
 *  template markup whose stat spans panel.ts already updates; the global search box is wired in
 *  panel.ts (it needs tab navigation). Bindings are re-bound on every render — the rows are few. */
import { recentDecidedVersions } from "../inference/panel-search";
import type { PanelState } from "./panel";

export interface HomeCallbacks {
  respondToProperNounSuggestion?: (properNoun: string, accept: boolean, type: string) => void;
  linkProperNounToCard?: (properNoun: string, cardId: string) => void;
  proposalDecision?: (versionId: string, action: "applied" | "rejected") => void;
}

export interface HomeHelpers {
  esc: (s: string) => string;
  setSafeHTML: (el: HTMLElement, html: string) => void;
  buildCardPickerOptions: (cards: PanelState["cards"]) => string;
  showToast: (msg: string, isError?: boolean) => void;
}

/** Minimal root surface — panel.ts passes its shadow root. */
interface RootLike { getElementById(id: string): HTMLElement | null; }

export function renderHome(root: RootLike, state: PanelState, cbs: HomeCallbacks, h: HomeHelpers): void {
  const pendingEl = root.getElementById("home-pending");
  const recentEl = root.getElementById("home-recent");
  if (!pendingEl || !recentEl) return;

  const pendingSuggestions = (state.locationSuggestions ?? []).filter((s) => s.status === "pending");
  const pendingVersions = (state.versions ?? []).filter((v) => v.status === "pending");

  // --- Pending decisions queue ---
  let html = `<div class="home-section-title">Needs your decision</div>`;
  if (!pendingSuggestions.length && !pendingVersions.length) {
    html += `<div class="note" style="padding:6px 2px;">Nothing needs your attention.</div>`;
  }
  if (pendingSuggestions.length > 0) {
    const sug = pendingSuggestions[0]!;
    const properNoun = sug.properNoun;
    const defaultTypes = new Set(["character", "location", "faction", "class", "race", "memory"]);
    const existingCustomTypes = Array.from(new Set(
      (state.cards ?? [])
        .filter((c) => c.type && !defaultTypes.has(c.type.toLowerCase()))
        .map((c) => c.type)
    ));
    // Moved VERBATIM from the old Cards-banner branch in panel.ts (same element ids, same flow).
    html += `
      <div class="location-suggestion-banner" style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.20);border-radius:8px;padding:10px;margin-bottom:8px;display:flex;flex-direction:column;gap:8px;box-sizing:border-box;">
        <div style="font-weight:700;color:var(--theme-text-color);font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">New Noun Detected: "${h.esc(properNoun)}"</div>
        <div class="note" style="margin:0;font-size:11.5px;line-height:1.4;max-height:80px;overflow-y:auto;background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.04);">Detected in action: <em>"${h.esc(sug.actionText)}"</em></div>

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
              ${existingCustomTypes.map((t) => `<option value="${h.esc(t!)}"></option>`).join("")}
            </datalist>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-top:2px;">
          <button id="sug-accept-btn" style="background:rgba(16,185,129,0.15);color:#34d399;border-color:rgba(16,185,129,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;">Add Card</button>
          <button id="sug-ignore-btn" style="background:rgba(239,68,68,0.15);color:#fca5a5;border-color:rgba(239,68,68,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;">Ignore</button>
        </div>

        <div style="display:flex;gap:6px;align-items:center;margin-top:2px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
          <label style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">Already tracked?</label>
          <select id="sug-link-select" style="padding:4px 6px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);flex-grow:1;min-width:0;">${h.buildCardPickerOptions(state.cards)}</select>
          <button id="sug-link-btn" style="background:rgba(59,130,246,0.15);color:#93c5fd;border-color:rgba(59,130,246,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;white-space:nowrap;">Link</button>
        </div>
      </div>
    `;
  }
  for (const v of pendingVersions) {
    html += `<div class="home-result-row" style="cursor:default;">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Proposal: ${h.esc(v.characterName || "Plot Essentials")}</span>
        <span style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn-micro btn-micro--green" data-home-act="applied" data-home-vid="${h.esc(v.id)}">✓</button>
          <button class="btn-micro btn-micro--red" data-home-act="rejected" data-home-vid="${h.esc(v.id)}">✗</button>
        </span>
      </div>`;
  }
  h.setSafeHTML(pendingEl, html);

  // --- Recent activity (last 3 decided proposals) ---
  const recent = recentDecidedVersions(state.versions, 3);
  let rhtml = `<div class="home-section-title">Recent proposals</div>`;
  rhtml += recent.length
    ? recent.map((v) => `<div class="home-result-row" style="cursor:default;">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.esc(v.characterName || "Plot Essentials")}</span>
        <span class="home-result-sub">${h.esc(v.status)}</span>
      </div>`).join("")
    : `<div class="note" style="padding:6px 2px;">No proposals yet.</div>`;
  h.setSafeHTML(recentEl, rhtml);

  // --- Bindings (scoped to this container) ---
  pendingEl.querySelectorAll("[data-home-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vid = btn.getAttribute("data-home-vid");
      const act = btn.getAttribute("data-home-act") as "applied" | "rejected";
      if (vid && cbs.proposalDecision) cbs.proposalDecision(vid, act);
    });
  });

  if (pendingSuggestions.length > 0) {
    const sugTypeSelect = pendingEl.querySelector("#suggestion-type-select") as HTMLSelectElement | null;
    const sugCustomInput = pendingEl.querySelector("#suggestion-custom-type-input") as HTMLInputElement | null;
    sugTypeSelect?.addEventListener("change", () => {
      if (sugCustomInput) {
        sugCustomInput.style.display = sugTypeSelect.value === "custom" ? "inline-block" : "none";
        if (sugTypeSelect.value === "custom") sugCustomInput.focus();
      }
    });
    pendingEl.querySelector("#sug-accept-btn")?.addEventListener("click", () => {
      const sug = pendingSuggestions[0]!;
      let selectedType = sugTypeSelect?.value || "character";
      if (selectedType === "custom") selectedType = sugCustomInput?.value.trim() || "custom";
      cbs.respondToProperNounSuggestion?.(sug.properNoun, true, selectedType);
    });
    pendingEl.querySelector("#sug-ignore-btn")?.addEventListener("click", () => {
      const sug = pendingSuggestions[0]!;
      cbs.respondToProperNounSuggestion?.(sug.properNoun, false, "character");
    });
    const linkSelect = pendingEl.querySelector("#sug-link-select") as HTMLSelectElement | null;
    pendingEl.querySelector("#sug-link-btn")?.addEventListener("click", () => {
      const cardId = linkSelect?.value || "";
      if (!cardId) { h.showToast("Pick a card to link to", true); return; }
      const sug = pendingSuggestions[0]!;
      cbs.linkProperNounToCard?.(sug.properNoun, cardId);
    });
  }
}
