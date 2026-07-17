// Pure helpers for the panel's scenario-setup phase (extracted for testability, mirroring
// gui-edit.ts). Kept DOM-free so they can be unit-tested without a shadow-DOM harness.
//
// Regression context: the Scenario Setup widget — the picker that lets the user seed a setup answer
// from their Favorited Plot Essentials / characters — is rendered inside the Card Manager
// ("main-tab-tracker") main-tab pane. When the task-first "Home" tab ("main-tab-home") was added as
// the new default active pane, a brand-new scenario landed on Home and the setup widget stayed
// buried in the display:none tracker pane. During setup we therefore force the tracker pane visible.

export interface SetupPhaseInput {
  isManagerOnly: boolean;
  hasActiveSetupQuestion: boolean;
  actionCount: number;
}

// True while the panel should collapse to the Scenario Setup widget: either a live setup question is
// on screen, or the adventure is brand-new (fewer than 2 actions). Never in manager-only mode.
export function isSetupPhase(input: SetupPhaseInput): boolean {
  return !input.isManagerOnly && (input.hasActiveSetupQuestion || input.actionCount < 2);
}

// The id of the main-tab pane that must be visible: during setup the tracker pane (which hosts the
// setup widget) regardless of which tab the user last had; otherwise the user's active tab.
export function visibleMainTabPane(inSetupPhase: boolean, activeTabId: string): string {
  return inSetupPhase ? "main-tab-tracker" : activeTabId;
}
