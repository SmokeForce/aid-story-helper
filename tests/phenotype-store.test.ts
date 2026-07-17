import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Repo } from "../src/storage/repo";
import { __resetDbForTests } from "../src/storage/db";
import type { PhenotypeRecord } from "../src/inference/phenotype/types";

const rec = (over: Partial<PhenotypeRecord> = {}): PhenotypeRecord => ({
  shortId: "adv1", characterKey: "veya vallois", provenance: "sampled", gender: "female",
  population: "western", seed: 12345, cues: ["statuesque"], archetype: { shape: "Hourglass", scale: "Average" },
  measurements: { heightInches: 68, bustTrue: 37, band: 32, cupVolume: 5, waist: 23, hip: 35 },
  descriptorPhrase: "tall, an even hourglass", keyPair: "BWH: 32DD-23-35", quirks: ["Left-handed"],
  sampledAt: new Date().toISOString(), ...over,
});

describe("phenotype store", () => {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); __resetDbForTests(); });

  it("round-trips a record by [shortId, characterKey]", async () => {
    const repo = new Repo();
    await repo.putPhenotype(rec());
    const got = await repo.getPhenotype("adv1", "veya vallois");
    expect(got?.keyPair).toBe("BWH: 32DD-23-35");
    expect(got?.provenance).toBe("sampled");
  });

  it("returns undefined for an unknown key", async () => {
    expect(await new Repo().getPhenotype("adv1", "nobody")).toBeUndefined();
  });

  it("isolates by shortId", async () => {
    const repo = new Repo();
    await repo.putPhenotype(rec());
    expect(await repo.getPhenotype("adv2", "veya vallois")).toBeUndefined();
  });

  it("deleteAdventure cascades the phenotype store", async () => {
    const repo = new Repo();
    await repo.upsertAdventure({ shortId: "adv1", title: "T" });
    await repo.putPhenotype(rec());
    await repo.deleteAdventure("adv1");
    expect(await repo.getPhenotype("adv1", "veya vallois")).toBeUndefined();
  });
});
