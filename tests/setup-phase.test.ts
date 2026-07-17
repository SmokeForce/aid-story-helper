import { describe, it, expect } from "vitest";
import { isSetupPhase, visibleMainTabPane } from "../src/content/setup-phase";

describe("isSetupPhase", () => {
  it("is true when a live setup question is on screen", () => {
    expect(isSetupPhase({ isManagerOnly: false, hasActiveSetupQuestion: true, actionCount: 0 })).toBe(true);
    // even past 2 actions, an active question still counts as setup
    expect(isSetupPhase({ isManagerOnly: false, hasActiveSetupQuestion: true, actionCount: 9 })).toBe(true);
  });

  it("is true for a brand-new adventure with fewer than 2 actions", () => {
    expect(isSetupPhase({ isManagerOnly: false, hasActiveSetupQuestion: false, actionCount: 0 })).toBe(true);
    expect(isSetupPhase({ isManagerOnly: false, hasActiveSetupQuestion: false, actionCount: 1 })).toBe(true);
  });

  it("is false once the story has 2+ actions and no active question", () => {
    expect(isSetupPhase({ isManagerOnly: false, hasActiveSetupQuestion: false, actionCount: 2 })).toBe(false);
    expect(isSetupPhase({ isManagerOnly: false, hasActiveSetupQuestion: false, actionCount: 50 })).toBe(false);
  });

  it("is never true in manager-only mode", () => {
    expect(isSetupPhase({ isManagerOnly: true, hasActiveSetupQuestion: true, actionCount: 0 })).toBe(false);
    expect(isSetupPhase({ isManagerOnly: true, hasActiveSetupQuestion: false, actionCount: 0 })).toBe(false);
  });
});

describe("visibleMainTabPane", () => {
  it("forces the Card Manager (tracker) pane during setup so the Scenario Setup widget shows", () => {
    // Regression guard: the Home tab is the default active pane; during setup the widget lives in
    // the tracker pane, so it must win over the active tab or the picker stays buried (display:none).
    expect(visibleMainTabPane(true, "main-tab-home")).toBe("main-tab-tracker");
    expect(visibleMainTabPane(true, "main-tab-living-characters")).toBe("main-tab-tracker");
  });

  it("honors the user's active tab outside of setup", () => {
    expect(visibleMainTabPane(false, "main-tab-home")).toBe("main-tab-home");
    expect(visibleMainTabPane(false, "main-tab-memories")).toBe("main-tab-memories");
  });
});
