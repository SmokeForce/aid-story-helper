import { describe, it, expect } from "vitest";
import { label } from "../src/inference/phenotype/label";

describe("reverse label", () => {
  it("labels the female worked example 36-24-34", () => {
    const s = label({ heightInches: 68, bustTrue: 36, band: 32, cupVolume: 4, waist: 24, hip: 34 }, "female");
    expect(s.toLowerCase()).toContain("hourglass");
  });
  it("labels the male worked example 44-32-38 as a V-taper", () => {
    const s = label({ heightInches: 71, shoulders: 44, waist: 32, hip: 38 }, "male");
    expect(s.toLowerCase()).toContain("v-taper");
  });
  it("includes a stature word for a tall subject", () => {
    const s = label({ heightInches: 75, shoulders: 48, waist: 34, hip: 41 }, "male");
    expect(s.toLowerCase()).toMatch(/tall|statuesque|towering/);
  });
});
