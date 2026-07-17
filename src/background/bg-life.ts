/** Living Characters (Life card) engine: card archival via native delete, and the per-turn
 *  lifecycle — presence/dormancy, staleness fade, hard lifetime cap, folded resolution verdict,
 *  in-scene narrative refresh, and interval seeding. Extracted from background.ts. */
import { repo, auth, dlog, aidFetch as fetch, broadcastToTabs, isSafeEndpoint, ensureAuth } from "./bg-infra";
import { getSceneText } from "./bg-scene";
import { buildCardSave, buildCardCreate, buildCardDelete, DEFAULT_GQL_QUERIES } from "../inference/writeback";
import { isCharacterTriggered, type CardRow } from "../shared/types";
import { parseProtagonistName } from "../inference/card-command";
import { buildLifeCardValue, keyName, parseLifeCardEntry, shouldArchiveLifeCard, setLifeCardStatusValue, buildSeededDescription, buildLifeHistoryLine, shouldAttemptSeed, chooseSeedPair, shouldFadeStale, shouldRetireByAge, DEFAULT_LC_PRESSURES, rollMomentum, computeInScene, isSameLivingCharacterName, selectPressurePool } from "../inference/living-characters";
import { type SeededPair } from "../inference/injection";

export async function tryNativeCardDelete(shortId: string, cardId: string): Promise<{ ok: boolean; error?: string }> {
  const deleteOp = await repo.getOp("UseDeleteStoryCard");
  const deleteQuery = deleteOp?.query || DEFAULT_GQL_QUERIES.UseDeleteStoryCard;
  const req = buildCardDelete(auth.gqlEndpoint!, deleteQuery, auth.sessionToken!, cardId, shortId);
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = await res.json() as any;
  const r = Array.isArray(json) ? json[0] : json;
  if (r?.errors?.length) return { ok: false, error: r.errors[0]?.message || "Mutation rejected" };
  const data = r?.data;
  const payload = data && typeof data === "object" ? (Object.values(data)[0] as any) : undefined;
  // Honor an explicit success:false if the mutation surfaces one; otherwise any returned data is success.
  if (payload && payload.success === false) {
    return { ok: false, error: payload.message || "Mutation rejected" };
  }
  if (!data || Object.values(data).every((v) => v == null)) {
    return { ok: false, error: "Delete returned no data" };
  }
  return { ok: true };
}

/**
 * Archive a resolved/dormant Life Card the way the reference engine drops a resolved bucket's Story
 * Card: native `UseDeleteStoryCard` on the server + local soft-delete. The local soft-delete PRESERVES
 * `description` (the social history) and the id is tombstoned in `adv.lcArchived` so a full-list sync
 * can't resurrect it. On a genuine native-delete failure it returns the REAL server error WITHOUT
 * recreating the card (a previous "neutralize" fallback upserted the card back as an empty husk —
 * never do that). Differs from the manual `deleteStoryCard` handler, which wipes `description`.
 */
export async function archiveLifeCard(shortId: string, card: CardRow): Promise<{ ok: boolean; error?: string }> {
  if (!auth.sessionToken || !isSafeEndpoint(auth.gqlEndpoint)) return { ok: false, error: "No session token yet — interact with the page once, then retry." };
  try {
    const del = await tryNativeCardDelete(shortId, card.id);
    if (!del.ok) {
      console.warn(`[LifeCards] Native delete failed for ${card.id}: ${del.error}`);
      return { ok: false, error: del.error };
    }

    // Local soft-delete (keep value+description for the Archived record) + durable tombstone.
    const deletedAtStr = new Date().toISOString();
    const archivedCard = { ...card, deletedAt: deletedAtStr };
    await repo.putCards(shortId, [archivedCard]);
    const adv = await repo.getAdventure(shortId);
    if (adv) {
      const set = new Set(adv.lcArchived || []);
      set.add(card.id);
      adv.lcArchived = Array.from(set);
      // Stamp the owner's reseed cooldown so the engine doesn't immediately respawn this character.
      const settings = await repo.getSettings();
      const titlePrefix = settings?.livingCharactersTitlePrefix || "Life - ";
      const owner = (card.title || "").replace(new RegExp(`^${titlePrefix}`, "i"), "").trim().toLowerCase();
      if (owner) {
        adv.lcResolvedAt = adv.lcResolvedAt || {};
        adv.lcResolvedAt[owner] = (await repo.getActions(shortId)).length;
      }
      await repo.upsertAdventure(adv);
    }
    broadcastToTabs({
      kind: "approvedCardSync",
      payload: { ok: true, source: "card", cardId: card.id, value: archivedCard.value, description: archivedCard.description || "", keys: archivedCard.keys, deletedAt: deletedAtStr, blockAutosave: true }
    });
    return { ok: true };
  } catch (err: any) {
    console.error(`[LifeCards] Error archiving Life Card ${card.id}:`, err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function checkLifeCardUpdates(shortId: string, actionText: string): Promise<{ seededPair?: SeededPair }> {
  await ensureAuth();
  const settings = await repo.getSettings();
  if (settings?.enableLivingCharacters === false) return {};

  const cards = await repo.getCards(shortId);
  const adv = await repo.getAdventure(shortId);
  if (!adv) return {};

  // Per-adventure simulation config (roster, pressures, interval, etc.). Enable toggle + card
  // prefixes remain global. Built-in defaults apply when a field is unset.
  const lc = adv.livingConfig || {};
  const rosterText = lc.roster || "";
  const roster = rosterText.split("\n").map(n => n.trim()).filter(Boolean);
  if (roster.length === 0) {
    dlog("[LifeCards] Roster is empty for this adventure. Skipping update check.");
    return {};
  }

  // Get active Life Cards from the database
  const titlePrefix = settings?.livingCharactersTitlePrefix || "Life - ";
  const keyPrefix = settings?.livingCharactersKeyPrefix || "chaos-v2:";
  
  const lifeCards = cards.filter(c => {
    if (c.deletedAt) return false;
    const typeLower = (c.type || "").toLowerCase();
    const titleLower = (c.title || "").toLowerCase();
    const keysList = (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
    return (
      typeLower === "life" ||
      titleLower.startsWith(titlePrefix.toLowerCase()) ||
      keysList.some(k => k.startsWith(keyPrefix.toLowerCase()))
    );
  });

  const checkActions = await repo.getActions(shortId);
  const turnCount = checkActions.length + (actionText ? 1 : 0);
  const seededCardIds = new Set<string>();
  
  // Seeding config (see §P). `interval` = turns between new-relationship seed ATTEMPTS (retry until
  // one lands); `maxActive` is the hard concurrent cap on ALL live relationships (active + dormant).
  const interval = lc.interval ?? 15;
  const maxActive = lc.maxActive ?? 2;
  dlog(`[LifeCards] Turn: ${turnCount}, Live relationships: ${lifeCards.length}/${maxActive}`);

  const protagonist = (adv.protagonistName && adv.protagonistName.trim()) || parseProtagonistName(adv.memory) || "the player character";
  const npcRoster = roster.filter(name => name.toLowerCase() !== protagonist.toLowerCase());

  // 0. Auto-migrate/rename Life Cards if the character name in the roster changed (e.g. "Veya Vallois" -> "Veya")
  const updateOp = await repo.getOp("UseAutoSaveStoryCard");
  const updateQuery = updateOp?.query || DEFAULT_GQL_QUERIES.UseAutoSaveStoryCard;
  const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  for (let i = 0; i < lifeCards.length; i++) {
    const card = lifeCards[i]!;
    const ownerName = card.title ? card.title.replace(new RegExp(`^${titlePrefix}`, "i"), "").trim() : "";
    if (!ownerName) continue;

    const ownerLower = ownerName.toLowerCase();
    const exactMatch = npcRoster.some(name => name.toLowerCase() === ownerLower);
    if (!exactMatch) {
      // Find a roster character that matches by prefix/suffix boundary
      const matchingRosterName = npcRoster.find(rName => {
        const rLower = rName.toLowerCase();
        return (
          ownerLower.startsWith(rLower + " ") ||
          rLower.startsWith(ownerLower + " ")
        );
      });

      if (matchingRosterName && auth.sessionToken && isSafeEndpoint(auth.gqlEndpoint)) {
        dlog(`[LifeCards] Auto-migrating Life Card owner name from "${ownerName}" to "${matchingRosterName}"`);
        const oldOwner = ownerName;
        const newOwner = matchingRosterName;

        const parsed = parseLifeCardEntry(card.value);
        const targetVal = parsed.target || "";

        const newTitle = `${titlePrefix}${newOwner}`;
        const newKeys = `${keyPrefix}${keyName(newOwner)},${newOwner}${targetVal ? `,${targetVal}` : ""}`;

        let newValue = card.value || "";
        newValue = newValue.replace(new RegExp(`^Owner:\\s*${escapeRegex(oldOwner)}`, "i"), `Owner: ${newOwner}`);
        newValue = newValue.replace(new RegExp(`Owner:\\s*${escapeRegex(oldOwner)}`, "gi"), `Owner: ${newOwner}`);

        let newDesc = card.description || "";
        newDesc = newDesc.replace(new RegExp(escapeRegex(oldOwner), "gi"), newOwner);

        const updatedCard = {
          ...card,
          title: newTitle,
          keys: newKeys,
          value: newValue,
          description: newDesc
        };

        try {
          const saveReq = buildCardSave(auth.gqlEndpoint!, updateQuery, auth.sessionToken!, updatedCard, newValue);
          const saveRes = await fetch(saveReq.url, { method: "POST", headers: saveReq.headers, body: saveReq.body });
          if (saveRes.ok) {
            await repo.putCards(shortId, [updatedCard]);
            dlog(`[LifeCards] Successfully auto-migrated Life Card for "${oldOwner}" to "${newOwner}".`);
            broadcastToTabs({
              kind: "approvedCardSync",
              payload: { ok: true, source: "card", cardId: card.id, value: newValue, description: newDesc, keys: newKeys }
            });
            lifeCards[i] = updatedCard;
          }
        } catch (err) {
          console.error(`[LifeCards] Error auto-migrating Life Card for "${oldOwner}":`, err);
        }
      }
    }
  }

  // 2. Update active Life Cards (lifecycle only — the per-turn LLM narrative refresh is retired).
  const presenceText = await getSceneText(shortId, actionText);

  const relevance = lc.sceneRelevance || "strict";

  const getCharacterKeys = (charName: string) => {
    const charCard = cards.find(c => {
      if (c.deletedAt) return false;
      const typeLower = (c.type || "").toLowerCase();
      if (typeLower !== "character" && typeLower !== "custom") return false;
      return (c.title || "").toLowerCase() === charName.toLowerCase();
    });
    return charCard ? charCard.keys : charName;
  };

  // Engine-owned status lifecycle config + per-card dormancy stamps (persisted on the adventure record).
  const dormancyTurns = lc.dormancyTurns ?? 7;
  const dormantSince: Record<string, number> = adv.lcDormantSince || {};
  let dormantStateChanged = false;
  // Staleness clock: an in-scene active thread that goes `staleTurns` turns with no fresh occurrence
  // fades to dormant (and won't reactivate while stale), so the dormancy timeout archives it.
  const staleTurns = lc.staleTurns ?? 14;
  const lastEventTurn: Record<string, number> = adv.lcLastEventTurn || {};
  adv.lcLastEventTurn = lastEventTurn; // attach so any mid-function upsert (createLifeCard) persists updates
  let lastEventChanged = false;
  // Hard lifetime cap (0 = disabled): age measured from an IMMUTABLE seed stamp that — unlike the
  // staleness clock — never resets on in-scene activity, so a perpetually-shared-scene thread still
  // ages out. With the LLM resolution judge retired, this cap + staleness fade + dormancy timeout
  // + manual Resolve ARE the resolution mechanism (NLP lifecycle-as-judge).
  const maxActiveTurns = lc.maxActiveTurns ?? 4;
  const seededTurn: Record<string, number> = adv.lcSeededTurn || {};
  adv.lcSeededTurn = seededTurn; // attach so createLifeCard's upsert persists new stamps
  let seededTurnChanged = false;
  let liveCount = lifeCards.length;          // non-archived relationships (active + dormant) for the concurrent cap



  for (const card of lifeCards) {
    if (seededCardIds.has(card.id)) continue;

    const ownerName = card.title ? card.title.replace(new RegExp(`^${titlePrefix}`, "i"), "").trim() : "";
    if (!ownerName) continue;

    let current = card;
    const parsed = parseLifeCardEntry(current.value);
    const targetName = parsed.target || "";

    // Hard lifetime cap — a thread alive for `maxActiveTurns` turns is RETIRED no matter what (in
    // scene or not, judge or no judge). Applies before presence so a perpetually-refreshed pressure
    // can't dodge it. The seed stamp is set lazily here for legacy cards and never reset afterward.
    if (seededTurn[current.id] == null) { seededTurn[current.id] = turnCount; seededTurnChanged = true; }
    if (shouldRetireByAge(seededTurn[current.id]!, turnCount, maxActiveTurns)) {
      dlog(`[LifeCards] ${ownerName} thread hit max lifetime (${turnCount - seededTurn[current.id]!}/${maxActiveTurns} turns) — retiring regardless of activity.`);
      const archived = await archiveLifeCard(shortId, current);
      if (archived.ok) {
        liveCount--;
        delete seededTurn[current.id]; seededTurnChanged = true;
        if (dormantSince[current.id] != null) { delete dormantSince[current.id]; dormantStateChanged = true; }
        if (lastEventTurn[current.id] != null) { delete lastEventTurn[current.id]; lastEventChanged = true; }
      }
      continue;
    }

    // Presence drives active⇄dormant. The relationship is "in scene" when the owner is present and
    // the target is present (the protagonist is always considered present). "strict" requires both;
    // "off" keeps it live whenever the owner is present (target need not be).
    const ownerIsProtag = isSameLivingCharacterName(ownerName, protagonist);
    const targetIsProtag = !!targetName && isSameLivingCharacterName(targetName, protagonist);
    const ownerPresent = ownerIsProtag || isCharacterTriggered(presenceText, ownerName, getCharacterKeys(ownerName));
    const targetPresent = !targetName || targetIsProtag || isCharacterTriggered(presenceText, targetName, getCharacterKeys(targetName));
    const inScene = relevance === "strict" ? (ownerPresent && targetPresent) : ownerPresent;

    if (!inScene) {
      // Off-scene → REMOVED at dormancy (reference-faithful). The reference engine deletes a Life
      // card when it goes dormant rather than parking a "dormant" card on AID, where it would keep
      // occupying context/payload. So we do NOT flip a dormant status onto the card and do NOT
      // advance it off-screen; it simply sits for a short grace (`dormancyTurns`) so a brief exit
      // doesn't thrash, resuming if the owner returns. If the grace elapses, the card is archived
      // (deleted from AID; HISTORY is preserved in the local tombstone for carry-forward).
      if (dormantSince[current.id] == null) { dormantSince[current.id] = turnCount; dormantStateChanged = true; }
      const dt = turnCount - dormantSince[current.id]!;
      if (shouldArchiveLifeCard("dormant", dt, dormancyTurns)) {
        dlog(`[LifeCards] Removing off-scene Life Card for ${ownerName} at dormancy (off-scene ${dt} turns).`);
        const archived = await archiveLifeCard(shortId, current);
        if (archived.ok) { delete dormantSince[current.id]; dormantStateChanged = true; liveCount--; }
      }
      continue;
    }

    // Staleness clock → fade-and-delete (mirrors the reference engine's `makeDormant`): a thread the
    // narrator stops developing for `staleTurns` turns is ARCHIVED outright — the Life card is deleted
    // (HISTORY preserved) and the owner is put on reseed cooldown, so a NEW pressure can take its place
    // rather than a faded thread lingering as a ghost card. The clock starts at seed (and lazily here
    // for legacy cards) and resets whenever the in-scene update writes a fresh occurrence.
    if (lastEventTurn[current.id] == null) { lastEventTurn[current.id] = turnCount; lastEventChanged = true; }
    if (shouldFadeStale(lastEventTurn[current.id]!, turnCount, staleTurns)) {
      dlog(`[LifeCards] ${ownerName} thread faded (stale ${turnCount - lastEventTurn[current.id]!} turns, no development) — archiving so a new pressure can take its place.`);
      const archived = await archiveLifeCard(shortId, current);
      if (archived.ok) {
        liveCount--;
        delete lastEventTurn[current.id]; lastEventChanged = true;
        if (dormantSince[current.id] != null) { delete dormantSince[current.id]; dormantStateChanged = true; }
      }
      continue;
    }

    // In scene AND not stale → resume to active (clears any dormancy stamp).
    if (dormantSince[current.id] != null) { delete dormantSince[current.id]; dormantStateChanged = true; }

    // NLP development signal (replaces the retired per-turn LLM narrative refresh): the owner and
    // target sharing the scene IS the interaction evidence — reset the staleness clock. The old
    // "Latest Occurrence / Urgency" generation was pure flavor text costing one generation call
    // per in-scene Life card per turn (and users' API keys); the only load-bearing passenger was
    // the folded resolution judge, which is now this NLP lifecycle:
    // pair-in-scene keeps the thread alive; dormancy archives separated pairs; the hard lifetime
    // cap retires everything else; manual ✅ Resolve remains. No LLM anywhere in this engine.
    if (lastEventTurn[current.id] !== turnCount) { lastEventTurn[current.id] = turnCount; lastEventChanged = true; }

    // Seedling/dormant → active flip: engine-owned, one direct card write on the in-scene turn
    // (no LLM). The retired narrative refresh used to impose "active" as a side effect; the engine
    // now does it explicitly, so a resumed thread re-enters the AN roster / panel as active.
    const statusLower = (parsed.status || "").toLowerCase();
    if (statusLower === "seedling" || statusLower === "dormant") {
      try {
        const newValue = setLifeCardStatusValue(current.value, "active");
        const updatedCard = { ...current, value: newValue };
        const saveReq = buildCardSave(auth.gqlEndpoint!, updateQuery, auth.sessionToken!, updatedCard, newValue);
        const saveRes = await fetch(saveReq.url, { method: "POST", headers: saveReq.headers, body: saveReq.body });
        if (saveRes.ok) {
          await repo.putCards(shortId, [updatedCard]);
          current = updatedCard;
          dlog(`[LifeCards] ${ownerName} seedling activated (in scene).`);
          broadcastToTabs({ kind: "approvedCardSync", payload: { ok: true, source: "card", cardId: current.id, value: newValue, description: current.description || "" } });
        }
      } catch (err) {
        console.error(`[LifeCards] Error activating seedling Life Card for ${ownerName}:`, err);
      }
    }
  }

  // 3. Seed a NEW relationship — deterministic and scene-gated (mirrors library.js `maybeCreateSeed`).
  //    There is NO off-screen simulation: dormant cards are never advanced. New threads form on the
  //    seed interval (retry-until-success), gated to whoever is actually on stage in "strict" mode.
  const createLifeCard = async (owner: string, target: string): Promise<SeededPair | null> => {
    if (!(auth.sessionToken && isSafeEndpoint(auth.gqlEndpoint))) return null;
    const pressuresText = lc.pressures || DEFAULT_LC_PRESSURES;
    const defaultPool = pressuresText.split("\n").map(p => p.trim()).filter(Boolean);
    // A configured pairing pool for this exact couple overrides the default pool EXCLUSIVELY; otherwise
    // the general pool applies. Pairings only decide WHICH pressure, never who was chosen to seed.
    const pressures = selectPressurePool(owner, target, lc.pressurePairs, defaultPool);
    const pressure = pressures.length ? pressures[Math.floor(Math.random() * pressures.length)]! : "friendship";
    const momentum = rollMomentum();

    dlog(`[LifeCards] Seeding relationship: ${owner} feels ${pressure} toward ${target} (momentum: ${momentum})`);
    const createOp = await repo.getOp("SaveQueueStoryCard");
    const createQuery = createOp?.query || DEFAULT_GQL_QUERIES.SaveQueueStoryCard;
    const tempId = Math.floor(Math.random() * 1e9).toString();
    const keys = `${keyPrefix}${keyName(owner)},${owner},${target}`;
    const initialValue = buildLifeCardValue({ owner, target, pressure, occurrence: "none", momentum, status: "seedling" });
    // Carry forward this owner's prior relationship LOG from the SINGLE most-recent archived card
    // (its description is already the bounded one-line-per-pressure log). Summing ALL archived
    // descriptions — each of which already embedded the prior ones — is what caused the exponential
    // description blowup (multi-MB cards). buildSeededDescription dedups + caps the result.
    const ownerTitleLower = `${titlePrefix}${owner}`.toLowerCase();
    const ownerKeyLower = `${keyPrefix}${keyName(owner)}`.toLowerCase();
    const priorLog = cards
      .filter(c => c.deletedAt && ((c.title || "").toLowerCase() === ownerTitleLower ||
        (c.keys || "").split(/[,;]+/).map(k => k.trim().toLowerCase()).includes(ownerKeyLower)))
      .sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")))[0]?.description || "";
    const initialDesc = buildSeededDescription(priorLog, buildLifeHistoryLine(owner, pressure, target, momentum));
    const newCardRow: CardRow = { id: tempId, shortId, type: "Life", title: `${titlePrefix}${owner}`, keys, value: initialValue, description: initialDesc };
    try {
      const req = buildCardCreate(auth.gqlEndpoint!, createQuery, auth.sessionToken!, newCardRow, initialValue);
      const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
      if (!res.ok) return null;
      const json = await res.json() as any;
      const returnedCard = json?.[0]?.data?.updateStoryCard?.storyCard || json?.[0]?.data?.saveQueueStoryCard?.storyCard ||
        json?.[0]?.data?.updateStoryCard || json?.[0]?.data?.saveQueueStoryCard;
      if (!returnedCard) return null;
      const savedCard = { ...newCardRow, id: returnedCard.id };
      await repo.putCards(shortId, [savedCard]);
      lastEventTurn[returnedCard.id] = turnCount; // seed counts as the initial event → starts the staleness clock
      seededTurn[returnedCard.id] = turnCount;    // immutable birth stamp → drives the hard lifetime cap (never reset)
      adv.lcLastSeedTurn = turnCount; // stamp ONLY on success → a failed attempt retries next turn
      adv.lcSeedCount = (adv.lcSeedCount ?? 0) + 1;
      await repo.upsertAdventure(adv);
      dlog(`[LifeCards] Seeded Life Card for ${owner} (ID: ${returnedCard.id})`);
      broadcastToTabs({ kind: "approvedCardSync", payload: { ok: true, source: "card", cardId: returnedCard.id, value: savedCard.value, description: savedCard.description || "" } });
      return { owner, target, pressure, momentum };
    } catch (err) {
      console.error("[LifeCards] Error seeding Life Card:", err);
      return null;
    }
  };

  let seededPair: SeededPair | undefined;
  if (shouldAttemptSeed({ liveCount, maxActive, seedCount: adv.lcSeedCount ?? 0, turnCount, lastSeedTurn: adv.lcLastSeedTurn ?? 0, interval })) {
    // Owners eligible for a NEW thread: no existing live card + past their reseed cooldown.
    const existingOwners = new Set(lifeCards.filter(c => !c.deletedAt).map(c => {
      const name = c.title ? c.title.replace(new RegExp(`^${titlePrefix}`, "i"), "").trim() : "";
      return name.toLowerCase();
    }).filter(Boolean));
    const reseedCooldown = lc.reseedCooldown ?? 15;
    const resolvedAt = adv.lcResolvedAt || {};
    const eligibleOwners = npcRoster.filter(name => {
      const nameLower = name.toLowerCase();
      const alreadyHas = Array.from(existingOwners).some(existing =>
        existing === nameLower || existing.startsWith(nameLower + " ") || nameLower.startsWith(existing + " "));
      if (alreadyHas) return false;
      if (reseedCooldown > 0) {
        const r = resolvedAt[nameLower];
        if (r != null && turnCount - r < reseedCooldown) {
          dlog(`[LifeCards] ${name} on reseed cooldown (${turnCount - r}/${reseedCooldown}). Not eligible to seed.`);
          return false;
        }
      }
      return true;
    });
    // Non-protagonist roster NPCs currently in scene — scene-gates the seed in "strict" mode.
    const sceneNPCs = computeInScene(presenceText, npcRoster.map(name => ({ name, keys: getCharacterKeys(name) })));
    const seedMode = relevance === "strict" ? "strict" : "off";
    const pair = chooseSeedPair({
      sceneNPCs,
      eligibleOwners,
      npcRoster,
      // The protagonist may be TARGETED but never owns; "the player character" is a placeholder, not a real name.
      protagonist: protagonist === "the player character" ? "" : protagonist,
      mode: seedMode,
      involvement: lc.protagonistInvolvement || "normal",
    });
    if (pair) {
      const created = await createLifeCard(pair.owner, pair.target);
      if (created) seededPair = created;
    } else {
      dlog(`[LifeCards] Seed attempt found no eligible pair (mode=${seedMode}, sceneNPCs=${sceneNPCs.length}, eligible=${eligibleOwners.length}). Retrying next turn.`);
    }
  }

  if (dormantStateChanged || lastEventChanged || seededTurnChanged) {
    adv.lcDormantSince = dormantSince;
    adv.lcLastEventTurn = lastEventTurn;
    adv.lcSeededTurn = seededTurn;
    await repo.upsertAdventure(adv);
  }

  return { seededPair };
}
