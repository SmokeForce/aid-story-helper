/** The panel's static skeleton: the full stylesheet and HTML markup for the Story Helper shadow-DOM UI.
 *  Extracted from panel.ts (where it was a 2,200-line inline template) so the logic file stays navigable.
 *  `version` is the manifest version rendered in the footer. */
export function buildPanelTemplate(version: string): string {
  return `
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
        --bg-panel-solid: #121216;
        --bg-card: rgba(255, 255, 255, 0.02);
        --btn-bg: rgba(255, 255, 255, 0.04);
        --btn-hover: rgba(255, 255, 255, 0.1);
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      }
      :host(.dragging), :host(.dragging) .box {
        transition: none !important;
      }
      
      .theme-emerald {
        --accent-color: #10b981;
        --accent-glow: rgba(16, 185, 129, 0.2);
        --accent-border: #059669;
        --theme-text-color: #34d399;
        --bg-panel-solid: #121216;
      }
      .theme-synthwave {
        --accent-color: #d946ef;
        --accent-glow: rgba(217, 70, 239, 0.2);
        --accent-border: #c026d3;
        --theme-text-color: #f472b6;
        --bg-glass: rgba(20, 16, 32, 0.88);
        --bg-panel-solid: #141020;
      }
      .theme-amber {
        --accent-color: #f59e0b;
        --accent-glow: rgba(245, 158, 11, 0.2);
        --accent-border: #d97706;
        --theme-text-color: #fbbf24;
        --bg-panel-solid: #121216;
      }
      .theme-sapphire {
        --accent-color: #06b6d4;
        --accent-glow: rgba(6, 182, 212, 0.2);
        --accent-border: #0891b2;
        --theme-text-color: #22d3ee;
        --bg-glass: rgba(15, 20, 32, 0.88);
        --bg-panel-solid: #0f1420;
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
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        box-sizing: border-box;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      }
      /* Desktop minimized state: Text pill */
      @media (min-width: 601px) {
        .box.minimized {
          width: 130px;
          height: 32px;
          min-width: 130px;
          min-height: 32px;
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
          cursor: pointer;
        }
        .box.minimized #drag-handle {
          padding-bottom: 0;
          border-bottom: none;
          margin-bottom: 0;
          justify-content: space-between;
          align-items: center;
          height: 100%;
          width: 100%;
        }
        .box.minimized #min-toggle {
          background: none;
          border: none;
          color: var(--accent-color);
          cursor: pointer;
          font-size: 13px;
          padding: 0 4px;
          margin: 0;
          width: auto;
          height: auto;
          display: inline-block;
          border-radius: 0;
        }
        .box.minimized #min-toggle:hover {
          color: var(--theme-text-color);
          background: none;
        }
      }

      /* Mobile minimized state: Circle icon */
      @media (max-width: 600px) {
        .box.minimized {
          width: 45px;
          height: 45px;
          min-width: 45px;
          min-height: 45px;
          border-radius: 50%;
          overflow: hidden;
          resize: none;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          background: var(--bg-glass);
          border-color: var(--accent-color);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          cursor: pointer;
        }
        .box.minimized #drag-handle {
          padding-bottom: 0;
          border-bottom: none;
          margin-bottom: 0;
          justify-content: center;
          align-items: center;
          height: 100%;
          width: 100%;
        }
        .box.minimized #min-toggle {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border-radius: 50%;
        }
        .box.minimized #min-toggle:hover {
          color: var(--theme-text-color);
          background: rgba(255, 255, 255, 0.05);
        }
        .box.minimized .badge-dot {
          position: absolute;
          top: 6px;
          right: 6px;
          margin: 0;
          width: 8px;
          height: 8px;
          z-index: 10;
        }
        .box:not(.minimized) {
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          max-width: none !important;
          max-height: none !important;
          resize: none !important;
          border-radius: 14px !important;
        }
      }

      /* Narrow-viewport (phone) layout: cap the expanded panel's height so it never covers the
         whole screen — the story underneath must stay scrollable and touch-reachable. The panel's
         own scroll containers (.tab-pane / .scrollable-panel) become self-contained so a scroll
         gesture that hits the top/bottom of the panel's content never chains into the page scroll.
         Threshold intentionally matches applyPosition()'s "window.innerWidth <= 600" branch in
         panel.ts exactly — anything above 600px must stay on the desktop floating/resizable path
         (user-set inline height from localStorage) with zero interference from this block.
         Only max-height is set here, not height: on mobile, applyPosition() already sizes the
         outer host to "min(70dvh, 70vh)" and sets "box.style.height = 100%", so the box fills
         the host with no gap for short content. The earlier "@media (max-width: 600px)" block
         above already applies "height: 100% !important" / "max-height: none !important" to this
         same selector; this block comes later in source order so, at equal specificity, its
         max-height (below) is the one that wins and supplies the real cap — while the fill
         ("height: 100%") from the earlier block is left standing. Forcing "height: auto" here
         would fight that fill and reopen a gap under short content, so it's deliberately omitted. */
      @media (max-width: 600px) {
        .box:not(.minimized) {
          max-height: 70vh !important;
          max-height: min(70dvh, 70vh) !important;
        }
        /* Mobile top-chrome compaction: the adventure title must never wrap to a second line
           (one-line ellipsis), and the header/stats strips shed their desktop breathing room —
           vertical space is the scarcest resource on a phone. !important where the element
           carries inline template styles. */
        .box:not(.minimized) #st {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex: 1;
          font-size: 12.5px;
        }
        .box:not(.minimized) #drag-handle {
          padding-bottom: 5px;
          margin-bottom: 5px;
        }
        /* Adaptive nav (Mobile Rethink Phase A, spec 1): #view-tracker is a flex column, so pure
           CSS order docks the tab bar at the bottom directly above the pinned footer on mobile.
           Desktop keeps document order (tabs on top). No DOM reparenting. */
        .box:not(.minimized) #main-tab-nav {
          order: 98;
          margin-bottom: 0 !important;
          margin-top: 8px;
        }
        .box:not(.minimized) #main-footer {
          order: 99;
          margin-top: 6px !important;
        }
        /* Touch targets: the tiny icon/micro buttons (delete ✕, edit ✏, regen ⚡, Clear, …) are
           14px glyphs with a few px of padding — far under the ~40px recommended hit area, and a
           mis-tap near a red delete is the expensive kind. Grow their HIT AREA on mobile without
           growing the glyphs. !important beats the inline padding most of them carry. */
        .box:not(.minimized) .btn-icon,
        .box:not(.minimized) .btn-micro,
        .box:not(.minimized) .knows-del,
        .box:not(.minimized) .pref-del,
        .box:not(.minimized) .lc-pairing-del {
          min-width: 36px !important;
          min-height: 36px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        /* Drawer/summary rows (NPC drawers, Knows/Preferences/Memory Bank sections, ALM, config
           groups): denser-than-tappable text rows on a phone — pad them toward touch height. */
        .box:not(.minimized) summary {
          padding-top: 8px !important;
          padding-bottom: 8px !important;
        }
        /* Mobile editing surfaces: textareas can't be corner-resized on touch, so give every one a
           usable base height up front, and bump input/select rows toward comfortable touch-target
           height. !important because most fields carry inline template styles (font-size:11px,
           min-height:60px, etc.) that would otherwise win. The focused textarea additionally
           auto-grows in keyboard mode (panel.ts growFocusedTextarea). */
        .box:not(.minimized) textarea {
          min-height: 88px !important;
          font-size: 12px !important;
        }
        .box:not(.minimized) input[type="text"],
        .box:not(.minimized) input[type="number"],
        .box:not(.minimized) select {
          min-height: 34px !important;
          font-size: 12px !important;
        }
        /* The banners container (Active Location + "New Noun Detected" suggestion) sits ABOVE the
           scrollable results area with flex-shrink:0 — a tall suggestion banner otherwise extends
           past the panel's 70dvh cap with its Add Card/Ignore/Link buttons unreachable (user report:
           "the create/ignore/link buttons aren't on my screen"). Bound it and give it its own
           self-contained scroll so every control can always be reached. */
        .box:not(.minimized) #location-banners-container {
          max-height: 45vh;
          max-height: min(45dvh, 45vh);
          overflow-y: auto;
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
        .tab-pane,
        .scrollable-panel {
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
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
      /* ---- Reusable button classes ---- */
      /* Gradient CTA — replaces the old #an / #uc per-ID rules and inline gradient buttons.
         :hover is required to beat the generic button:hover background override. */
      .btn-primary {
        background: linear-gradient(135deg, var(--accent-color), var(--accent-border));
        border: none;
        color: #ffffff;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        box-shadow: 0 4px 12px var(--accent-glow);
      }
      .btn-primary:hover {
        background: linear-gradient(135deg, var(--accent-color), var(--accent-color));
        box-shadow: 0 6px 16px var(--accent-glow);
        color: #ffffff;
        transform: translateY(-1px);
      }

      /* Ghost icon button */
      .btn-icon {
        background: none;
        border: none;
        padding: 2px;
        margin: 0;
        cursor: pointer;
        color: var(--text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .btn-icon:hover {
        color: var(--text-primary);
        background: none;
        box-shadow: none;
        transform: none;
        border-color: transparent;
      }

      /* Export / download row button */
      .btn-export {
        justify-content: flex-start;
        background: rgba(16, 185, 129, 0.05);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.2);
        padding: 6px 10px;
        text-align: left;
        width: 100%;
        box-sizing: border-box;
      }

      /* Small CRUD action button + color modifiers */
      .btn-micro {
        margin: 0;
        padding: 2px 6px;
        font-size: 9.5px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        width: auto;
        min-height: unset;
      }
      .btn-micro--green { background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
      .btn-micro--blue  { background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
      .btn-micro--red   { background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
      .btn-micro--amber { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }

      /* Cancel / dismiss button */
      .btn-cancel {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 10px;
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
      /* Compact inputs for dense UI sections (LC, overlays, Adventures Manager) */
      .input-compact {
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 6px;
        height: auto;
      }
      /* Dark-bg inputs for inline editing contexts */
      .input-dark {
        background: rgba(0, 0, 0, 0.3);
      }
      .location-manager-banner summary::-webkit-details-marker {
        display: none; /* the summary is a styled flex row; the default triangle doubles the affordance */
      }
      /* Back-to-top: floats bottom-right above the toolbar, shown only once the active scroll
         container is meaningfully scrolled (panel.ts). Helps desktop too — long rosters/memory
         lists scroll far on every form factor. */
      #back-to-top {
        display: none;
        position: absolute;
        right: 14px;
        bottom: 52px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        align-items: center;
        justify-content: center;
        background: var(--bg-glass);
        color: var(--accent-color);
        border: 1px solid var(--border-color);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        z-index: 50;
        padding: 0;
        margin: 0;
      }
      #back-to-top:hover {
        border-color: var(--accent-color);
      }
      /* NPC drawer navigation rows: large tappable buttons whose chevron signals "opens its own
         panel view" (Knows / Preferences / Memory Bank). */
      .npc-section-btn {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        margin: 0;
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      .npc-section-btn:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: var(--accent-color);
      }
      .npc-section-chevron {
        color: var(--text-secondary);
        font-size: 15px;
        line-height: 1;
      }
      /* Home tab: search-result / queue rows + section titles (Mobile Rethink Phase A). */
      .home-result-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 7px 8px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11.5px;
        color: var(--text-primary);
      }
      .home-result-row:hover { background: rgba(255, 255, 255, 0.06); }
      .home-result-sub { color: var(--text-secondary); font-size: 10px; flex-shrink: 0; }
      .home-section-title {
        font-weight: 700;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--theme-text-color);
        margin: 2px 0 4px;
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
        color: var(--theme-text-color);
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
        border: 1px solid var(--border-color);
        border-left: 2.5px solid var(--text-secondary);
        border-radius: 6px;
        margin: 4px 0;
        background: rgba(255, 255, 255, 0.01);
        transition: all 0.2s ease;
      }
      details.local-category-details[open] {
        background: rgba(0, 0, 0, 0.1);
        border-color: rgba(255, 255, 255, 0.08);
      }
      details.local-category-details > summary {
        cursor: pointer;
        padding: 6px 10px;
        font-weight: 600;
        font-size: 11px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.03em;
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
        width: 100%;
        box-sizing: border-box;
      }
      details.local-category-details > summary:hover {
        background: rgba(255, 255, 255, 0.02);
      }
      details.local-category-details > summary::after {
        content: "▾";
        color: var(--text-secondary);
        font-size: 9px;
        transition: transform 0.2s;
        display: inline-block;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 6px;
      }
      details.local-category-details[open] > summary::after {
        transform: rotate(-180deg);
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
      /* Shared scrollable container — replaces per-ID rules and duplicated inline styles */
      .scrollable-panel {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
        min-height: 0;
        max-height: none;
        box-sizing: border-box;
      }
      .scrollable-panel--column {
        display: flex;
        flex-direction: column;
      }
      /* Direct children must keep their natural height. Without this, accordion
         children (.box details have overflow:hidden, so their flex min-height
         resolves to 0) shrink to fit the column instead of overflowing it, so
         overflow-y:auto never engages and the content is clipped rather than
         scrolled. */
      .scrollable-panel--column > * {
        flex-shrink: 0;
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
        display: flex;
        align-items: center;
        justify-content: space-between;
        list-style: none; /* Hide standard list-marker in Firefox */
      }
      .box summary::-webkit-details-marker {
        display: none; /* Hide standard list-marker in Chrome/Safari */
      }
      .box summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .box summary::after {
        content: "▾";
        color: var(--text-secondary);
        font-size: 10px;
        transition: transform 0.2s;
        display: inline-block;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
      }
      .box details[open] > summary::after {
        transform: rotate(-180deg);
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
        content: "▾";
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
        content: "▾";
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
        content: "▾";
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
        content: "▾";
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
        content: "▾";
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
        content: "▾";
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
        content: "▾";
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
      /* Main panel tab panes (Card Manager / Memory Bank / Living Characters).
         Display (flex/none) is toggled in JS; structural props live here. */
      .main-tab-pane {
        flex-direction: column;
        flex: 1;
        overflow: hidden;
        min-height: 0;
      }

      /* Shared sub-tab nav row (settings tabs + offmeta + manager groups) */
      .sub-tab-nav {
        display: flex;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 6px;
        gap: 4px;
        overflow-x: auto;
      }

      /* Shared underline-style sub-tab buttons (offmeta + manager groups).
         Hover resets neutralize the generic button:hover lift/glow. */
      .input-caption {
        flex: 1;
        text-align: center;
        font-size: 10px;
        color: var(--text-secondary);
        margin: 0;
      }
      .subtab-btn {
        flex: 1;
        white-space: nowrap;
        margin: 0;
        padding: 4px 8px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 10.5px;
        font-weight: 500;
        transition: color 0.2s, border-color 0.2s;
      }
      .subtab-btn:hover {
        color: var(--text-primary);
        background: none;
        box-shadow: none;
        transform: none;
        border-color: transparent;
      }
      .subtab-btn.active,
      .subtab-btn.active:hover {
        color: var(--accent-color);
        border-bottom-color: var(--accent-color);
        font-weight: 600;
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

      /* Memory Bank timeline cards */
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
        <button id="min-toggle">—</button>
      </div>
      <button id="back-to-top" type="button" title="Back to top">↑</button>
      <div id="toast">Settings saved</div>
      
      <div id="content-body" style="width:100%; flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0;">
        <!-- VIEW: TRACKER -->
        <div id="view-tracker" style="display:flex; flex-direction:column; flex:1; overflow:hidden; min-height:0;">
          <!-- Tab Navigation for Main Panel (Home first + default; adaptive bottom bar on mobile) -->
          <div id="main-tab-nav" class="main-tab-nav" style="margin-bottom:8px;">
            <button class="main-tab-btn active" data-tab="main-tab-home" style="flex:1;white-space:nowrap;margin:0;position:relative;">Home<span id="home-pending-badge" style="display:none;"></span></button>
            <button class="main-tab-btn" data-tab="main-tab-tracker" style="flex:1;white-space:nowrap;margin:0;position:relative;">Cards</button>
            <button class="main-tab-btn" data-tab="main-tab-memories" style="flex:1;white-space:nowrap;margin:0;position:relative;">Memory<span id="unread-memories-badge" style="display:none;"></span></button>
            <button class="main-tab-btn" data-tab="main-tab-living-characters" style="flex:1;white-space:nowrap;margin:0;position:relative;">Living</button>
          </div>

          <!-- Main Pane 0: Home (task-first landing — Mobile Rethink Phase A §2) -->
          <div id="main-tab-home" class="main-tab-pane" style="display:flex; flex-direction:column;">
            <div style="position:relative; flex-shrink:0;">
              <input id="home-search" type="text" class="input-compact input-dark" placeholder="Search cards, NPCs…" autocomplete="off" style="width:100%; box-sizing:border-box; padding:7px 10px; font-size:12px;" />
              <div id="home-search-results" style="display:none; flex-direction:column; gap:2px; margin-top:4px; background:rgba(0,0,0,0.35); border:1px solid var(--border-color); border-radius:8px; padding:4px; max-height:220px; overflow-y:auto;"></div>
            </div>
            <div class="scrollable-panel" style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
              <div id="home-status" style="padding:8px 12px;background:rgba(0,0,0,0.25);border-radius:8px;border:1px solid var(--border-color);display:flex;justify-content:space-between;font-size:10px;color:var(--text-secondary);font-family:SFMono-Regular,Consolas,monospace;flex-shrink:0;">
                <div>Actions: <span id="stat-turn" style="color:var(--accent-color);font-weight:bold;">0</span></div>
                <div>Last Auto-Updated: <span id="stat-last-auto" style="color:var(--accent-color);font-weight:bold;">-</span></div>
              </div>
              <div id="home-pending"></div>
              <div id="home-recent"></div>
            </div>
          </div>

          <!-- Main Pane 1: Card Manager -->
          <div id="main-tab-tracker" class="main-tab-pane" style="display:none;">
            <div id="location-banners-container" style="flex-shrink:0;"></div>
            <div id="setup-helper-container" style="flex-shrink:0; display:none;"></div>
            <div id="view-tracker-scrollable" class="scrollable-panel" style="margin-top:8px;">
              <div id="results"></div>
              <div id="debug-container"></div>
            </div>
          </div>

          <!-- Main Pane 2: Memory Bank (Player timeline / NPC point-of-view banks) -->
          <div id="main-tab-memories" class="main-tab-pane" style="display:none; flex-direction:column;">
            <div class="tab-nav sub-tab-nav">
              <button class="subtab-btn active" data-mbtab="mb-player" style="flex:1;white-space:nowrap;margin:0;">Player</button>
              <button class="subtab-btn" data-mbtab="mb-npc" style="flex:1;white-space:nowrap;margin:0;">NPC</button>
            </div>
            <div id="mb-player" class="mb-pane" style="display:flex; flex-direction:column; flex:1; min-height:0;">
              <div style="display:flex; gap:6px; margin-bottom:8px;">
                <button id="refine-mem" class="btn-primary" style="flex:1; margin:0; padding:6px; font-size:10px;">⚡ Regenerate Latest</button>
              </div>
              <div id="aid-memories-scrollable" class="scrollable-panel">
                <div id="aid-memories-list" style="display:flex; flex-direction:column; gap:8px;"></div>
              </div>
            </div>
            <div id="mb-npc" class="mb-pane scrollable-panel scrollable-panel--column" style="display:none; gap:8px;"></div>
          </div>

          <!-- Main Pane 3: Living Characters -->
          <div id="main-tab-living-characters" class="main-tab-pane" style="display:none; gap:8px;">
            <div id="lc-status-banner" style="flex-shrink:0;"></div>
            <div id="lc-scrollable" class="scrollable-panel scrollable-panel--column" style="gap:12px;">
              
              <!-- SECTION: ACTIVE RELATIONSHIP STATUS (LIFE CARDS) -->
              <details class="group-header" open style="border-left-color:var(--accent-color) !important;">
                <summary style="color:var(--accent-color) !important; font-weight:700; font-size:11.5px; cursor:pointer;">
                  <span>🌱 Active Relationships (Life Cards)</span>
                </summary>
                <div style="padding:10px; display:flex; flex-direction:column; gap:8px; background:rgba(255,255,255,0.01); border-top:1px solid var(--border-color); box-sizing:border-box; width:100%;">
                  <div id="lc-active-list" style="display:flex; flex-direction:column; gap:8px;"></div>
                  <button id="lc-btn-add-card" class="action-btn" style="background:rgba(192,132,252,0.12); color:#c084fc; border:1px solid rgba(192,132,252,0.3); font-weight:600; padding:6px; border-radius:6px; cursor:pointer; font-size:10px; align-self:flex-start; margin-top:4px; width:auto; min-height:unset;">➕ Seed Custom Life Card</button>
                  
                  <!-- Form: Add Custom Life Card (Hidden by default) -->
                  <div id="lc-add-card-form" style="display:none; flex-direction:column; gap:8px; border:1px solid var(--border-color); border-radius:12px; padding:10px; background:rgba(0,0,0,0.2); box-sizing:border-box; width:100%; margin-top:8px;">
                    <div style="font-weight:700; color:var(--text-primary); font-size:11px;">🌱 Seed Custom Life Card</div>
                    
                    <div style="display:flex; flex-direction:column; gap:2px;">
                      <label style="font-weight:600; font-size:10px;">Owner Character (who feels the pressure)</label>
                      <select id="lc-add-owner" class="input-compact input-dark"></select>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; box-sizing:border-box; width:100%;">
                      <div style="display:flex; flex-direction:column; gap:2px;">
                        <label style="font-weight:600; font-size:10px;">Target Name</label>
                        <input type="text" id="lc-add-target" class="input-compact input-dark" placeholder="Bob" />
                      </div>
                      <div style="display:flex; flex-direction:column; gap:2px;">
                        <label style="font-weight:600; font-size:10px;">Pressure</label>
                        <input type="text" id="lc-add-pressure" class="input-compact input-dark" placeholder="jealousy" />
                      </div>
                    </div>

                    <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:2px;">
                      <button id="lc-add-cancel-btn" style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); color:var(--text-primary); font-size:10px; padding:3px 8px; border-radius:4px; cursor:pointer; width:auto; min-height:unset;">Cancel</button>
                      <button id="lc-add-submit-btn" style="background:rgba(168,85,247,0.15); border:1px solid rgba(168,85,247,0.3); color:#c084fc; font-size:10px; padding:3px 8px; border-radius:4px; cursor:pointer; font-weight:600; width:auto; min-height:unset;">Create Life Card</button>
                    </div>
                  </div>
                </div>
              </details>

              <!-- SECTION: CONFIGURATION -->
              <details class="group-header" style="--accent-color:#38bdf8; --accent-glow:rgba(56,189,248,0.15); border-left-color:#38bdf8 !important;">
                <summary style="color:#38bdf8 !important; font-weight:700; font-size:11.5px; cursor:pointer;">
                  <span>⚙️ Simulation Configuration</span>
                </summary>
                <div style="padding:10px; display:flex; flex-direction:column; gap:8px; background:rgba(255,255,255,0.01); border-top:1px solid var(--border-color); font-size:10.5px; color:var(--text-secondary); box-sizing:border-box; width:100%;">
                  
                  <div style="display:flex; flex-direction:column; gap:3px;">
                    <label style="font-weight:600;">NPC Characters Roster (one name per line)</label>
                    <textarea id="lc-config-roster" rows="4" class="input-compact input-dark" style="resize:vertical;" placeholder="Alice&#10;Bob&#10;Charlie"></textarea>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:3px; margin-top:4px;">
                    <label style="font-weight:600;">Active Pressures Pool (one per line)</label>
                    <textarea id="lc-config-pressures" rows="4" class="input-compact input-dark" style="resize:vertical;" placeholder="friendship&#10;jealousy&#10;rivalry&#10;trust&#10;curiosity"></textarea>
                    <div style="font-size:9px; color:var(--text-secondary); opacity:0.8;">The DEFAULT pool. Used for any pair without its own pairing below.</div>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:3px; margin-top:4px;">
                    <label style="font-weight:600;">Pairing Pressure Pools</label>
                    <div style="font-size:9px; color:var(--text-secondary); opacity:0.8; margin-bottom:2px;">Give a specific couple their own pressures. Symmetric (either direction) and exclusive — when both characters are the pair, pressures come ONLY from here, not the default pool.</div>
                    <datalist id="lc-character-names"></datalist>
                    <div id="lc-pairing-pools" style="display:flex; flex-direction:column; gap:6px;"></div>
                    <button id="lc-add-pairing" class="action-btn" style="background:rgba(192,132,252,0.10); color:#c084fc; border:1px solid rgba(192,132,252,0.3); font-weight:600; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:10px; align-self:flex-start; width:auto; min-height:unset; margin-top:2px;">+ Add pairing</button>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; box-sizing:border-box; width:100%;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Protagonist Name</label>
                      <input id="lc-config-protagonist" type="text" class="input-compact input-dark" placeholder="Frank" />
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Protagonist Involvement</label>
                      <select id="lc-config-involvement" class="input-compact input-dark">
                        <option value="off">Off (NPCs only)</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="always">Always</option>
                      </select>
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; box-sizing:border-box; width:100%;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Seed Interval (actions between new relationships)</label>
                      <input id="lc-config-interval" type="number" min="1" step="1" placeholder="15" class="input-compact input-dark" />
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Max Active Relationships</label>
                      <select id="lc-config-max" class="input-compact input-dark">
                        <option value="1">1 (Focused)</option>
                        <option value="2">2 (Layered)</option>
                        <option value="3">3 (Busy)</option>
                        <option value="4">4 (Chaos)</option>
                      </select>
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; box-sizing:border-box; width:100%;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Scene Relevance Gate</label>
                      <select id="lc-config-relevance" class="input-compact input-dark">
                        <option value="off">Off (Seed regardless of who's present)</option>
                        <option value="strict">Strict (Seed only around present characters)</option>
                      </select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Dormancy Timeout (Actions)</label>
                      <input id="lc-config-dormancy" type="number" min="0" step="1" placeholder="7" class="input-compact input-dark" />
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; box-sizing:border-box; width:100%;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Reseed Cooldown (Actions)</label>
                      <input id="lc-config-reseed-cooldown" type="number" min="0" step="1" placeholder="15" class="input-compact input-dark" />
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Activity Lifespan (actions)</label>
                      <input id="lc-config-stale" type="number" min="0" step="1" placeholder="14" class="input-compact input-dark" />
                    </div>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:3px; margin-top:8px;">
                    <label style="font-weight:600;">Max Lifetime (actions)</label>
                    <input id="lc-config-max-lifetime" type="number" min="0" step="1" placeholder="4" class="input-compact input-dark" />
                    <span style="font-size:9.5px; color:var(--text-secondary);">Hard cap: a pressure is retired after this many actions even while it stays active — most resolve within 3-5. Catches threads the resolution judge never concludes. 0 disables the cap.</span>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:3px; margin-top:8px;">
                    <label style="font-weight:600;">Continue / Retry Actions</label>
                    <select id="lc-config-continue-mode" class="input-compact input-dark">
                      <option value="defer">Defer directive to next action (recommended)</option>
                      <option value="skip">Don't run on Continue/Retry</option>
                    </select>
                    <span style="font-size:9.5px; color:var(--text-secondary);">Continue/Retry can't carry an injected pressure directive. "Defer" still runs the simulation and surfaces the directive on the next Do/Say/Story; "Skip" pauses the simulation on those actions.</span>
                  </div>

                  <button id="lc-btn-save-config" class="action-btn" style="margin-top:8px; background:linear-gradient(135deg, #0ea5e9, #0284c7); border:none; padding:6px; font-weight:600; border-radius:6px; color:#fff; cursor:pointer; width:100%; min-height:unset;">💾 Save Simulation Config</button>
                </div>
              </details>

              <!-- SECTION: PRESSURES PRESETS LIBRARY -->
              <details class="group-header" style="--accent-color:#10b981; --accent-glow:rgba(16,185,129,0.15); border-left-color:#10b981 !important;">
                <summary style="color:#10b981 !important; font-weight:700; font-size:11.5px; cursor:pointer;">
                  <span>🎭 Pressures & Presets Library</span>
                </summary>
                <div style="padding:10px; display:flex; flex-direction:column; gap:10px; background:rgba(255,255,255,0.01); border-top:1px solid var(--border-color); font-size:10.5px; color:var(--text-secondary); box-sizing:border-box; width:100%;">
                  <div>
                    <div style="font-weight:700; margin-bottom:4px; color:var(--text-primary);">Core Pressures</div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px;" id="lc-core-pills-container"></div>
                  </div>

                  <div style="margin-top:4px; width:100%;">
                    <div style="font-weight:700; margin-bottom:6px; color:var(--text-primary);">Preset Modes (Click to Apply)</div>
                    <div style="display:flex; flex-direction:column; gap:8px; box-sizing:border-box; width:100%;" id="lc-modes-container"></div>
                  </div>

                  <div style="margin-top:4px; margin-bottom:4px;">
                    <div style="font-weight:700; margin-bottom:4px; color:var(--text-primary);">Wildcard Spark Injections</div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px;" id="lc-wild-pills-container"></div>
                  </div>
                </div>
              </details>

            </div>
          </div>

          <!-- Pinned Main Footer -->
          <div id="main-footer" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-color);box-sizing:border-box;">
            <div style="display:flex;gap:12px;align-items:center;">
              <button id="open-settings" style="background:none;border:none;padding:4px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;" title="Settings">
                <svg style="width:16px;height:16px;fill:currentColor;" viewBox="0 0 24 24">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.13,5.91,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.67,9.34,2.85,9.48l2.03,1.58C4.83,11.36,4.81,11.69,4.81,12c0,0.31,0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                </svg>
              </button>
              <button id="bf" title="Backfill Scenario History">⤓ Backfill</button>
            </div>
            
            <button id="create-card-trigger" style="background:var(--accent-color);color:#fff;border:none;border-radius:4px;padding:3.5px 8px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 1px 3px rgba(0,0,0,0.2);" title="Create Story Card">
              <span>+ Add Card</span>
            </button>

            <div style="display:flex;gap:6px;align-items:center;">
              <div style="font-size:10px;color:var(--text-secondary);font-family:system-ui;">v${version}</div>
              <button id="info-help" type="button" class="btn-icon" title="About & How it works">
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
          <div class="tab-nav sub-tab-nav">
            <button class="tab-btn active" data-tab="tab-gen" style="flex:1;white-space:nowrap;margin:0;">General</button>
            <button class="tab-btn" data-tab="tab-prov" style="flex:1;white-space:nowrap;margin:0;">AI Provider</button>
            <button class="tab-btn" data-tab="tab-memoraid" style="flex:1;white-space:nowrap;margin:0;">MemorAID</button>
            <button class="tab-btn" data-tab="tab-living-characters" style="flex:1;white-space:nowrap;margin:0;">Living Characters</button>
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
                <button id="info-action-lookback" type="button" class="btn-icon" title="About Action Lookback Window">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="win" type="number" min="1" placeholder="20" style="margin:4px 0 8px 0;" />

              <!-- Dummy setting strictly for visual screenshot matching with public version -->
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Character Card Character Limit</label>
              </div>
              <input id="char-card-limit" type="number" min="100" max="2000" placeholder="600" style="margin:4px 0 8px 0;" />

              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:4px 0 2px 0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="enable-automatic-updates" type="checkbox" style="width:auto;margin:0;" />
                Auto-Update Character Cards
              </label>
              <div class="note" style="margin:0 0 10px 22px;">When on, the extension proposes Story Card updates on its own as characters leave a scene or stay active. Off by default — "Generate Core Character" always works manually.</div>

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
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="enable-memoraid" type="checkbox" style="width:auto;margin:0;" />
                  Enable MemorAID Thought Tracking?
                </label>
              </div>
              <div class="note" style="margin:0 0 8px;">Add the characters to track in the Card Manager → 🧠 MemorAID section (per adventure).</div>
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="use-memories" type="checkbox" style="width:auto;margin:0;" />
                  Use Memories in Plot Essentials?
                </label>
                <button id="info-memories" type="button" class="btn-icon" title="How Memories work">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>

              <!-- Dummy setting strictly for visual screenshot matching with public version -->
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Action Lookback Window</label>
                <button id="info-memoraid-lookback" type="button" class="btn-icon" title="About MemorAID Action Lookback Window">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-win" type="number" min="1" placeholder="8" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Thought Lookback (previous thoughts)</label>
                <button id="info-memoraid-thought" type="button" class="btn-icon" title="About MemorAID Thought Lookback">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-thought-win" type="number" min="1" placeholder="1" style="margin:4px 0 8px 0;" />

              <!-- Dummy setting strictly for visual screenshot matching with public version -->
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Thought Card Character Limit</label>
              </div>
              <input id="thought-card-limit" type="number" min="100" max="4000" placeholder="2000" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Scene Presence Lookback</label>
                <button id="info-memoraid-presence" type="button" class="btn-icon" title="About MemorAID Scene Presence Lookback">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-presence-win" type="number" min="1" placeholder="5" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Action Intercept Timeout (Seconds)</label>
                <button id="info-intercept-timeout" type="button" class="btn-icon" title="About Action Intercept Timeout">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="intercept-timeout" type="number" min="1" placeholder="4" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:12px 0 4px 0;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="enable-crystallized" type="checkbox" style="width:auto;margin:0;" />
                  Enable Crystallized Memory (Long-Term)?
                </label>
              </div>
              <div class="note" style="margin:0 0 8px;">Distills short-term thoughts into decaying episodic snapshots and permanent facts.</div>

              <div class="note" style="margin:8px 0 4px;font-weight:bold;color:var(--text-secondary);">Distillation layers — produced together in ONE LLM call per NPC per window; turn a layer off to drop it from the call:</div>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 3px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-knows-enabled" type="checkbox" style="width:auto;margin:0;" /> Knows (permanent facts)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 3px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-nodes-enabled" type="checkbox" style="width:auto;margin:0;" /> Vivid Memories (decaying snapshots)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 3px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-outlook-enabled" type="checkbox" style="width:auto;margin:0;" /> Outlook (settled beliefs)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 3px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-preferences-enabled" type="checkbox" style="width:auto;margin:0;" /> Preferences (personal texture)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 8px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-npc-memory-enabled" type="checkbox" style="width:auto;margin:0;" /> NPC Memory Bank (per-NPC POV recollections)
              </label>

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Crystallized Distillation Interval (K turns)</label>
              </div>
              <input id="crystallized-interval" type="number" min="1" placeholder="20" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Crystallized Entry Max Characters</label>
              </div>
              <input id="crystallized-max-chars" type="number" min="100" max="1000" placeholder="900" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Crystallized Node Cap (max active nodes)</label>
              </div>
              <input id="crystallized-node-cap" type="number" min="1" placeholder="12" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Crystallized NPC Memory Bank size (max stored memories)</label>
              </div>
              <input id="crystallized-npc-memory-cap" type="number" min="1" placeholder="400" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Rendered layer caps</label>
              </div>
              <div style="display:flex;gap:6px;margin:4px 0 2px 0;">
                <input id="crystallized-knows-cap" class="input-compact" type="number" min="1" placeholder="2" title="Max Knows lines (characters prioritized)" style="margin:0;flex:1;" />
                <input id="crystallized-recalls-cap" class="input-compact" type="number" min="0" placeholder="2" title="Max Recalls lines (scene memory pulls; 0 disables)" style="margin:0;flex:1;" />
                <input id="crystallized-vivid-cap" class="input-compact" type="number" min="1" placeholder="4" title="Max Vivid Memory lines" style="margin:0;flex:1;" />
                <input id="crystallized-outlook-cap" class="input-compact" type="number" min="1" placeholder="2" title="Max Outlook lines" style="margin:0;flex:1;" />
                <input id="crystallized-preferences-cap" class="input-compact" type="number" min="1" placeholder="4" title="Max Preferences lines (concrete texture: tastes, quirks, habits)" style="margin:0;flex:1;" />
              </div>
              <div style="display:flex;gap:6px;margin:0 0 8px 0;">
                <label class="input-caption">Knows</label>
                <label class="input-caption">Recalls</label>
                <label class="input-caption">Vivid</label>
                <label class="input-caption">Outlook</label>
                <label class="input-caption">Prefs</label>
              </div>
            </div>

            <!-- Pane: Living Characters Settings -->
            <div id="tab-living-characters" class="tab-pane" style="display:none; flex-direction:column; gap:8px;">
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="enable-living-characters" type="checkbox" style="width:auto;margin:0;" />
                  Enable Living Characters Integration?
                </label>
              </div>

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Life Card Title Prefix</label>
              </div>
              <input id="lc-title-prefix" type="text" placeholder="Life - " style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Life Card Key Prefix</label>
              </div>
              <input id="lc-key-prefix" type="text" placeholder="chaos-v2:" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="group-thoughts-in-roster" type="checkbox" style="width:auto;margin:0;" />
                  Group Thought Cards in Roster?
                </label>
              </div>

              <div class="note" style="margin-top:12px; padding:10px; border-radius:6px; border:1px solid var(--border-color); background:rgba(255,255,255,0.02); font-size:10.5px; line-height:1.4; color:var(--text-secondary);">
                <strong>Living Characters Engine</strong><br/>
                Developed by <a href="https://github.com/LivingNarratives" target="_blank" style="color:var(--accent-color); text-decoration:none; font-weight:600;">Living Narratives</a> (<a href="https://www.reddit.com/user/Jrowe0311/" target="_blank" style="color:var(--accent-color); text-decoration:none; font-weight:600;">u/Jrowe0311</a>).
                <br/>
                Incorporated with explicit permission to simulate autonomous NPC thoughts, relationships, and social dynamics.
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
              <input id="key" type="password" placeholder="sk-ant-..." style="margin:4px 0 8px 0;" />
              
              <label>Model</label>
              <select id="model" style="margin:4px 0 8px 0;"><option value="">(enter API key)</option></select>
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
                <button id="revert-prompt" class="btn-micro btn-micro--red" style="white-space:nowrap;align-self:flex-start;">↺ Revert All</button>
              </div>

              <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Plot Essentials Prompt (your AI provider)</h4>
              <div class="note" style="margin-bottom:4px;">Drives Plot Essentials updates via your configured provider (Claude/GPT/etc). Story Cards are generated through the same provider below.</div>
              <label style="margin-top:6px;">1. General Instructions</label>
              <textarea id="prompt-s1" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">2. Personality & Identity Rules</label>
              <textarea id="prompt-s2" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">3. Limits & Budget Ceilings</label>
              <textarea id="prompt-s3" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">4. Output JSON Schema</label>
              <textarea id="prompt-s4" rows="5" style="margin:4px 0 8px 0;"></textarea>

              <div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:8px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Per-Type Card Command Templates</h4>
                <div class="note" style="margin-bottom:6px;">Sent to your configured AI provider to generate the card. Use <code>{{title}}</code> (required) and <code>{protagonist}</code>. Custom covers any user-named type (e.g. "Song").</div>

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
                <button id="ex-story" class="btn-export">
                  <span>⬇ Just Story Actions JSON</span>
                </button>
                <button id="ex-cards" class="btn-export">
                  <span>⬇ Just Story Cards JSON</span>
                </button>
                <button id="ex-pe" class="btn-export">
                  <span>⬇ Just Plot Essentials Plaintext</span>
                </button>
                <button id="ex-aidmemories" class="btn-export">
                  <span>⬇ Just Memory Bank JSON</span>
                </button>
                <button id="ex-propernouns" class="btn-export">
                  <span>⬇ Just Proper Noun Logs JSON</span>
                </button>
                <button id="ex-all" class="btn-export" style="background:rgba(245,158,11,0.05);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);">
                  <span>⬇ All Combined Backup JSON</span>
                </button>
              </div>

              <h4 style="margin:14px 0 4px;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Diagnostics</h4>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:4px 0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="show-dbg" type="checkbox" style="width:auto;margin:0;" />
                Verbose debug logging (Console)
              </label>
              <div class="note">Logs detailed internal extension activity to the browser Console (developer diagnostic — noisy).</div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:8px 0 4px;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="log-pe-console" type="checkbox" style="width:auto;margin:0;" />
                Log Raw Update Plot Essentials to Console
              </label>
              <div class="note">When enabled, logs ONLY the raw AI request/response from the last Update Plot Essentials run to the browser Console (open DevTools → Console). Independent of verbose logging above.</div>
              
              <div style="margin-top:14px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Learned Operations</h4>
                <div id="learned-ops-list" style="font-family:SFMono-Regular,Consolas,monospace;font-size:9.5px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:6px;padding:6px;margin-top:4px;color:var(--text-primary);max-height:80px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;">None</div>
              </div>

              <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <h4 style="margin:0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Proper Noun Log Editor</h4>
                  <button id="clear-pn-logs" class="btn-micro btn-micro--red">Clear All</button>
                </div>
                <div class="note" style="margin-bottom:6px;">Review or delete proper nouns processed by auto-detection.</div>
                <div id="pn-logs-list" style="max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:6px;padding:6px;box-sizing:border-box;">
                  <!-- Proper noun log items -->
                </div>
              </div>
              
              <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Mobile Settings Sync (QR Code)</h4>
                <div class="note" style="margin-bottom:8px;">Generate a QR code to sync settings (excluding API keys) directly to your mobile device.</div>
                <button id="gen-qr-btn" type="button" class="btn" style="justify-content:center;background:rgba(168,85,247,0.08);color:#c084fc;border:1px solid rgba(168,85,247,0.25);padding:6px 12px;font-weight:600;font-size:11px;border-radius:6px;cursor:pointer;width:100%;box-sizing:border-box;">Generate Sync QR Code</button>
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
              <div class="offmeta-subtab-nav sub-tab-nav" style="padding-bottom:4px;margin-bottom:6px;gap:2px;">
                <button class="subtab-btn offmeta-subtab-btn active" data-subtab="offmeta-subtab-intro">Introduction</button>
                <button class="subtab-btn offmeta-subtab-btn" data-subtab="offmeta-subtab-premade">Premade AIN</button>
                <button class="subtab-btn offmeta-subtab-btn" data-subtab="offmeta-subtab-anpe">AN/PE</button>
                <button class="subtab-btn offmeta-subtab-btn" data-subtab="offmeta-subtab-individual">Individual AIN</button>
              </div>

              <!-- Search box and status feedback -->
              <div id="offmeta-search-container" style="display:none; flex-direction:column; gap:6px; margin-bottom:4px;">
                <input id="offmeta-search" type="text" placeholder="Search instructions (e.g. repetition, romance)..." style="width:100%; box-sizing:border-box; margin:0; font-size:11.5px; padding:5px 8px;" />
                <div id="offmeta-status" style="font-size:11px; display:none; padding:4px 8px; border-radius:4px; font-weight:600; line-height:1.35; margin-top:2px;"></div>
              </div>

              <!-- Repository container -->
              <div id="offmeta-repo-container" class="scrollable-panel scrollable-panel--column" style="gap:12px;">
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
              <div class="note" style="margin-bottom:4px; font-size:11px;">Manage your Favorites library and explore locally stored adventure data.</div>

              <!-- Full DB Backup / Restore (entire IndexedDB incl. adventures, cards, thoughts, settings & Favorites) -->
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <button class="db-backup-trigger" style="flex:1;margin:0;padding:6px 8px;font-size:10.5px;font-weight:700;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.25);border-radius:6px;cursor:pointer;" title="Back up the entire local database to a JSON file (survives swapping the signed XPI for a test build)">⬇ Back Up Database</button>
                <button class="db-restore-trigger" style="flex:1;margin:0;padding:6px 8px;font-size:10.5px;font-weight:700;background:rgba(245,158,11,0.1);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);border-radius:6px;cursor:pointer;" title="Restore the entire local database from a backup JSON file">⬆ Restore Database</button>
              </div>

              <!-- Sub Tab Navigation -->
              <div class="manager-subtab-nav sub-tab-nav" style="padding-bottom:4px;margin-bottom:6px;gap:2px;">
                <button id="btn-subtab-global" class="subtab-btn active">Favorites</button>
                <button id="btn-subtab-explorer" class="subtab-btn">Local DB Explorer</button>
              </div>

              <!-- Main Manager Container -->
              <div id="manager-panels" class="scrollable-panel scrollable-panel--column" style="gap:8px;">
                <!-- Subpane: Favorites -->
                <div id="subpane-global" style="display:flex; flex-direction:column; gap:8px;">
                  <button id="btn-show-add-global" class="btn-primary" style="width:100%;margin:0;padding:6px;font-size:11px;">+ Add New Favorite</button>
                  
                  <!-- Form: Add Favorite (hidden by default) -->
                  <div id="form-add-global" style="display:none; flex-direction:column; gap:6px; background:rgba(0,0,0,0.25); border:1px solid var(--border-color); border-radius:8px; padding:10px; box-sizing:border-box;">
                    <div style="font-weight:600; font-size:11px; color:var(--theme-text-color); margin-bottom:4px;">New Favorite</div>
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
                      <button id="btn-cancel-global" class="btn-cancel" style="margin:0;">Cancel</button>
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
            </div>
          </div>
          
          <!-- Actions footer for settings view -->
          <div id="settings-footer" style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border-color);padding-top:8px;margin-top:4px;">
            <button id="cancel-settings" class="btn-cancel" style="margin:0;">Cancel</button>
            <button id="save" class="btn-primary" style="margin:0;min-width:70px;padding:4px 10px;">Save</button>
          </div>
        </div>

        <!-- VIEW: UPDATE PLOT ESSENTIALS (Analyze) -->
        <div id="view-analyze" style="display:none;flex-direction:column;gap:10px;margin-top:8px;flex:1;overflow:hidden;min-height:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);padding-bottom:6px;">
            <div style="font-weight:600;color:var(--accent-color);font-size:13px;">⟳ Update Plot Essentials</div>
            <button id="analyze-back" style="margin:0;background:rgba(255,255,255,0.02);padding:4px 10px;border-radius:6px;">← Back</button>
          </div>
          <div id="analyze-body" class="scrollable-panel"></div>
        </div>

        <!-- VIEW: FULL-PANEL EDITOR (Mobile Rethink Phase B) -->
        <div id="view-editor" style="display:none;flex-direction:column;gap:10px;margin-top:8px;flex:1;overflow:hidden;min-height:0;">
          <div style="display:flex;justify-content:flex-start;align-items:center;gap:10px;border-bottom:1px solid var(--border-color);padding-bottom:6px;">
            <button id="editor-back" style="margin:0;background:rgba(255,255,255,0.02);padding:4px 10px;border-radius:6px;flex-shrink:0;">← Back</button>
            <div id="editor-title" style="font-weight:600;color:var(--accent-color);font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Editor</div>
          </div>
          <div id="editor-body" class="scrollable-panel" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>

        <!-- OVERLAY: MEMORIES HELP -->
        <div id="overlay-memories" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Memories Block Feature</div>
            <button class="overlay-close" type="button" data-close="overlay-memories">×</button>
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
            <button class="overlay-close" type="button" data-close="overlay-action-lookback">×</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls the number of recent gameplay actions and the resulting text from AI Dungeon sent to your third-party provider for story card updates.</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID LOOKBACK HELP -->
        <div id="overlay-memoraid-lookback" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Action Lookback Window</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-lookback">×</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls how many prior actions are sent to the model for thought generation.</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID THOUGHT LOOKBACK HELP -->
        <div id="overlay-memoraid-thought" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Thought Lookback (previous thoughts)</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-thought">×</button>
          </div>
          <div class="overlay-content">
            <p>Turns each NPC's memory card into a rolling "Inner Self" cache: the card entry keeps the last <strong>N</strong> complete thoughts (newest on top), and those same prior thoughts are fed back as context when generating the next thought — so the character's internal monologue stays continuous instead of resetting every turn.</p>
            <p><strong>How it works:</strong><br/>Each turn the newest thought enters at the top and the rest roll down; the oldest beyond N leaves the visible entry but stays archived in the card's Notes log. Minimum <strong>1</strong> (the current thought). Recent story actions are NOT added here: AI Dungeon already generates with full story context.</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID PRESENCE HELP -->
        <div id="overlay-memoraid-presence" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Scene Presence Lookback</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-presence">×</button>
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
            <button class="overlay-close" type="button" data-close="overlay-intercept-timeout">×</button>
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
            <button class="overlay-close" type="button" data-close="overlay-add-card">×</button>
          </div>
          <div class="overlay-content" style="gap:10px;">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Card Type</label>
              <select id="ac-type" class="input-compact" style="margin:2px 0 4px 0;"></select>
              <input type="text" id="ac-custom-type" list="existing-custom-types" placeholder="Enter custom type…" class="input-compact" style="display:none;margin:2px 0 4px 0;" />
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Name / Title</label>
              <input id="ac-title" type="text" placeholder="e.g. Rena" class="input-compact" style="margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Trigger Keys (comma-separated)</label>
              <input id="ac-keys" type="text" placeholder="e.g. rena, merchant" class="input-compact" style="margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Description / Notes</label>
              <input id="ac-desc" type="text" placeholder="e.g. Optional notes" class="input-compact" style="margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Entry Value (Body)</label>
              <textarea id="ac-value" placeholder="The core story card content..." class="input-compact" style="resize:none;flex:1;min-height:80px;box-sizing:border-box;margin:2px 0 4px 0;"></textarea>
            </div>

            <button id="ac-submit" class="btn-primary" style="width:100%;margin-top:4px;padding:8px;font-size:11px;">Create & Push to AID</button>
          </div>
        </div>

        <!-- OVERLAY: GENERAL ABOUT & HELP -->
        <div id="overlay-help" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">About & How it Works</div>
            <button class="overlay-close" type="button" data-close="overlay-help">×</button>
          </div>
          <div class="overlay-content">
            <p>This extension orchestrates context tracking and memory management for your AI Dungeon adventures, generating all updates through your own configured AI provider.</p>
            
            <p><strong>1. Architectural Division: PE vs SC</strong></p>
            <ul style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:8px;">
              <li>
                <strong>Plot Essentials (PE):</strong> 
                Character blocks embedded directly inside your adventure's main memory context. Updates are fully driven by <strong>your configured outside AI Provider API</strong> (Claude, OpenAI GPT, Gemini, or local Ollama).
                <br/><span class="note" style="margin-top:2px;display:inline-block;">*Includes an option (enabled via <strong>Settings → General → Use Memories in Plot Essentials?</strong>) to automatically construct and prepend a dynamic Memories block in Plot Essentials via outside AI calls.</span>
              </li>
              <li>
                <strong>Story Cards (SC):</strong>
                World Info elements stored in AI Dungeon's database. Updates are driven by <strong>your configured AI provider</strong>, using the command instruction templates defined in settings, then saved back to the card.
              </li>
            </ul>

            <p><strong>2. Gameplay Context Window Integration</strong></p>
            <p>When generating Story Card updates, the extension dynamically captures the last <code>N</code> actions of chronological gameplay history (up to a <strong>strict 2,000-character ceiling</strong>, including newlines) and includes it in the generation prompt sent to your configured AI provider. For Location cards, the current card description is automatically prepended, reserving all remaining character budget for recent gameplay actions.</p>

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
            <br/><span class="note" style="margin-top:2px;display:inline-block;">*Enabling <strong>Settings → General → Automatically regen latest Memory Bank entry?</strong> automatically runs memory block refinement on the latest memory block whenever new actions are synchronized, using loop-safe diffing to prevent endless loops.</span></p>
          </div>
        </div>
      </div>
    </div>`;
}
