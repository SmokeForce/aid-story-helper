import { describe, it, expect } from "vitest";
import { pickActiveField } from "../src/interceptor/gui-edit";

const el = (tag: string) => ({ tagName: tag }) as unknown as Element;

describe("pickActiveField (isEditingInGui element selection)", () => {
  const textarea = el("TEXTAREA");
  const input = el("INPUT");
  const button = el("BUTTON");
  const body = el("BODY");

  it("uses the currently-focused field when it is a textarea/input (typing autosave)", () => {
    expect(pickActiveField(textarea, null, 0, 1000)).toBe(textarea);
    expect(pickActiveField(input, textarea, 0, 1000)).toBe(input);
  });

  it("falls back to the recently-focused field when focus moved to a non-field (clicked Finish)", () => {
    // Regression guard: clicking "Finish" makes document.activeElement the button (or <body>),
    // never null — the old `activeElement || lastActiveElement` returned the button and failed.
    expect(pickActiveField(button, textarea, 900, 1000)).toBe(textarea);
    expect(pickActiveField(body, textarea, 900, 1000)).toBe(textarea);
  });

  it("ignores a stale last-focused field beyond the recency window", () => {
    expect(pickActiveField(button, textarea, 0, 20000)).toBe(null);
  });

  it("returns null when neither current nor recent focus is a field", () => {
    expect(pickActiveField(button, button, 900, 1000)).toBe(null);
    expect(pickActiveField(null, null, 0, 1000)).toBe(null);
  });
});
