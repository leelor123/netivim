# Chapter 1 "Roots" (1904-1947): mission design notes

Data lives in `chapter.ts`, `dialogue.ts`, `cutscenes.ts` and `src/locales/he/ch01.json` (keys `ch01.*`). This file is for the level builder. Labels: DOC = DOCUMENTED, REC = RECONSTRUCTED, COMP = FICTIONAL COMPOSITE. Source IDs are from SOURCES.md. Hebrew text is only in the locale file. No fact here goes beyond `research/factcheck-ch00-ch01.md` and the opened entries of `research/perspectives-ch00-ch01.md`.

Global rules for all three missions:
- Checkpoints every 2-3 minutes (five per mission, keys `ch01.<m>.cp1..cp5`), instant retry from the last checkpoint.
- After a failure: show "What really happened" (keys `ch01.<m>.f1..f3`, listed in `MISSION_SCRIPTS[].failures`), then offer a hint (`h1..h3`). Hints are offered, never forced. Adaptive assist offers slower timers or extra checkpoints.
- No player aims at anyone. No person is harmed on screen. Violence stays off-screen.
- Bot script outline = the sequence the automated test bot (window.__netivim hook) follows to clear the mission. Each checkpoint lists the bot's actions.
- Noa and Dr. Samir Haddad are COMP. They voice the briefing and debrief; Two Lenses panels use `TWO_LENSES` (accepted facts first, then each narrative in its own terms, then shared ground).

---

## 1. Tower and Stockade (1937) - PZL, 15 min, sources C1-064, C1-065, C1-058, C1-101, C1-103

Label: setting DOC, the specific settlement, people and exact build order REC (the sources only support: prefabricated wood, a double wooden wall filled with gravel, a tower, built within a day; 55-57 settlements 1936-39; Tel Amal 10 Dec 1936 described as the first). The searchlight and the fence are game elements (REC); the fact-check does not document them, so the UI shows "reconstructed" on them.

Documented vs reconstructed:
- DOC: prefabricated wood, double wooden wall, gravel fill, tower; "within a day" (C1-065); count commonly cited as 57 (55 in one source); Tel Amal first (C1-064/065).
- REC: site, characters, the order of stages, the time pressure countdown, fence and searchlight.
- COMP: the settler and the tenant's relative (testimonies `settler`, `tenant`).
- Wording rule: say "within a day", never "overnight" (the fact-check HOLDs the overnight claim). Do not cite an Ottoman "one-night building" law (C1-F2 is UNVERIFIED, left out). Do not show attackers.

Context text (briefing, plus the Codex entries `arab-revolt`, `tower-and-stockade`, `peel-commission`):
- Why: the Arab Revolt of 1936-39 (C1-058, C1-059, C1-101); Peel's partition idea of July 1937 raised the stakes of where the borders would run (C1-058, C1-101). British land rules: the 1939 White Paper gave powers to restrict land transfer (C1-002) and the 1940 regulations barred purchases in some zones (C1-102, note); both come after 1937, so they appear in the debrief, not the briefing.
- NOT used (not approved): any Ottoman land-law leftover claim as the reason for fast building. Ottoman background is limited to the Prologue facts (Land Code 1858, Tapu Law 1859 are Prologue items). If the lead wants the Ottoman link, it needs a new fact-check.

Beats:
1. Dawn at the site (cp1). Noa and Samir brief (`tower.b1-b5`). Tutorial: mark the outline with stakes.
2. Unload prefabricated wall frames from carts (obj o1). Timer: sun arc across the sky is the clock.
3. Place double wall frames on the outline (cp2). Snap-to-grid; frames need two layers.
4. Fill the gap between the layers with gravel by passing buckets in a chain (cp3). Warm moment `tower.moment`: a girl from a nearby settlement brings water.
5. Raise the tower from sections, then unroll the fence and set the searchlight (cp4).
6. Dusk: switch on the searchlight (cp5). Cutscene `ch01.stockade-and-radio` can play after the debrief or at chapter end.
7. Debrief (`tower.d1-d4`) then the Two Lenses panel "land" (`TWO_LENSES` id `land`).

Objectives: `tower.o1..o5`. Interactables: wall-frame stacks, gravel pile and buckets, tower sections, fence roll, searchlight, water jug (moment), a signboard with the day's schedule.

Two Lenses (land, id `land`): Zionist/Israeli lens: land bought legally, developed, gave defense during the revolt. Palestinian lens: absentee owners sold over the heads of tenants who worked it for generations; each settlement turned bought land into Jewish-only land and created facts before any partition. Shared ground: large owners, some in Beirut or Damascus, sold much of the land; tenants were not the sellers; both sides' authors use the same purchase tables (Granott, quoted by Hadawi: 52.6 percent from large absentee owners, 9.4 percent from fellaheen, to end of 1936; C1-102). Land ownership ranges are not stated in this mission. Sources: C1-064, C1-065, C1-101, C1-102, C1-103. Gap: no Palestinian-authored account of tower-and-stockade sites themselves; the panel says so ("the records are silent", `tower.d4`). Nearby Arab villages and tenants: shown as the village-window light in the cutscene and the tenant testimony (COMP). Wadi al-Hawarith (C1-110, advocacy-oriented, and C1-103) is a possible optional codex card, "according to Zochrot", not in the base set.

Failure conditions (texts `tower.f1..f3`, all with source):
- Sun reaches the horizon before the searchlight is lit -> f1 "within a day, prefabricated" (C1-065).
- Gravel not placed between the layers when the tower stage starts -> f2 "double wall filled with gravel" (C1-065).
- Stages out of order -> f3 states that the order is a reconstruction (REC).
Hints: `tower.h1..h3`.

Bot script outline:
- cp1: wait for dawn, stake the outline (click 4 corner markers).
- cp2: drag frames from the cart to marker slots, 2 layers (repeat for N slots).
- cp3: hold the bucket-chain interaction until the gravel meter fills.
- cp4: place tower sections in order, unroll the fence along the outline.
- cp5: place and activate the searchlight, then the "dusk" event ends the mission.

---

## 2. Night Landing (Aliyah Bet, 1946) - STL (stealth) with an RSC (rescue) segment, 18 min, sources C1-055, C1-002, C1-101

The mission's gameplayType in `chapter.ts` is `STL` (the chapter validator allows one type per mission). The rescue segment (guide survivors ashore) is a second phase of the same mission.

Label: setting and statistics DOC (C1-055); ship, passengers, harbour and patrol routes REC; passengers COMP. No real ship is portrayed. The Exodus 1947 appears only as a text fact (about 4,500 aboard; the detail that three refugees were killed is NOT shown, to keep it free of graphic content).

Holocaust handling: background only. No camps, no images of suffering, no numbers of victims. Survivors are shown as people with dignity: tired, careful, helping each other, carrying small bundles, children and elders first. No dialogue describes what they suffered. The testimony `passenger` (COMP) speaks only of looking for a home.

Context texts (all sourced):
- British perspective: the 1939 White Paper (C1-002): 75,000 over five years (10,000 a year), plus 25,000 refugees, powers to restrict land transfer, and an independent state within ten years. Presented as the British government's stated policy (`lens immigration`, British lens). Khalidi (C1-101): after five years immigration depended on Arab acquiescence.
- Arab perspective on immigration: Palestinian national congresses (Jan 1919 - Aug 1922) demanded a halt to Zionist immigration and land transfer plus representative government (C1-101); Peel and the Anglo-American report record that strike aims included stopping immigration and land sales (C1-058, C1-059). Khalidi also reports that many Palestinians were positively impressed by the White Paper but could not accept its conditions (C1-101).
- Yishuv/Zionist lens: with the Holocaust looming, Britain closed the gates; the White Paper was seen as betrayal (perspectives T8, framed as the lens, no figure).
- Aliyah Bet statistics (C1-055): well over 100,000 by 1948, more than 70,000 of them survivors, over 90 percent of postwar ships intercepted, over 50,000 held on Cyprus. Landed totals are not established; do not give them.

Beats:
1. Briefing on the ship's deck at dusk (`landing.b1-b5`). Noa: context. Samir: the White Paper and the Arab concern. Narrator: reassurance that failure is "history, not you".
2. Open sea (cp1): steer the ship toward the signal fire/light on shore, stay out of sight. Patrol boats are telegraphed: a low horn and a lantern cone show their route ahead.
3. Patrol boats (cp2): wait in the swell shadow while a patrol passes. No harm if seen: the screen dims and the checkpoint reloads with the f1 text.
4. Searchlights (cp3): time movement between sweeps (fixed rhythm, an audio tick before each sweep).
5. Small boats (cp4): rescue phase. Load passengers into small boats, children and elders first; a calm-meter keeps the group quiet.
6. Shore (cp5): guide groups up the beach to a hiding place before sunrise. Warm moment `landing.moment`: a passenger shares a scarf with a child.
7. Debrief (`landing.d1-d3`) then the Two Lenses panel `immigration` (Zionist, Palestinian, British lenses, then shared ground).

Objectives: `landing.o1..o5`. Interactables: signal lantern, ship wheel/throttle, lifeboats, a rope line, shore markers, a lamp the group must keep covered.

Failure conditions (all non-violent, telegraphed):
- Caught in a searchlight or by a patrol boat -> f1: over 90 percent of postwar ships were intercepted (C1-055).
- Dawn arrives before everyone lands -> f2: ships that were intercepted led to detention on Cyprus, over 50,000 held (C1-055).
- Optional: three failures in a row -> f3 introduces Exodus 1947 (about 4,500 aboard), intercepted (C1-055), and offers assist.
Hints: `landing.h1..h3`.

Bot script outline:
- cp1: set course toward the shore marker, hold the throttle at low.
- cp2: wait on the "patrol-passing" event, then resume.
- cp3: move on the audio tick after each sweep ends (3 sweeps).
- cp4: load 3 groups into boats (drag the passenger icons, children first).
- cp5: tap the 5 shore markers in order, then end at the hiding place.

---

## 3. The Vote (29 Nov 1947) - DEC, 12 min, sources C1-060, C1-057, C1-101

Label: the vote result and the Resolution 181 content DOC (C1-060, C1-057); the secretariat staffer, the briefing-note task and the sequence REC; the player's role COMP.

UN text: only as a short cited excerpt and a summary (archive item `res181`, license `excerpt`; reuse terms of UN documents are unconfirmed). Used items: "corpus separatum under a special international regime" (Jerusalem), the vote 33-13-10 (one absent; the UK among the abstainers), the Mandate to end by 1 August 1948 at the latest, independence by 1 October 1948.

UNSCOP: the fact-check holds UNSCOP at page level (report date 3 Sep vs 31 Aug unconfirmed; majority/minority proposals only via a search summary). It is therefore NOT mentioned in the Hebrew text. If the lead wants it in the mission, a new fact-check is needed. The `eras.ts` event `unscop-1947` cites C1-015, which is missing from SOURCES.md (flag for the lead).

Reactions, each in its own terms (keys `ch01.vote.s.*`):
- Yishuv/Zionists: great joy after the vote (Khalidi's description, "jubilant"; no Zionist-authored source is in the approved set: gap).
- Palestinian Arab leadership and population: stunned (Khalidi); seen as Zionist in provenance and as violating self-determination; the Arabs asked for an ICJ opinion on the Assembly's competence to enforce partition; the draft was defeated 21-20 in the Ad Hoc Committee (C1-101). Khalidi's map facts, attributed: Jewish state about 5,500 sq mi vs Arab state about 4,500; Jews no more than 35 percent of the population and owners of under 7 percent of the land (Hadawi's 1945 figure, 5.67 percent, C1-102). The Hebrew text attributes these to Khalidi.
- Arab states: asked for the ICJ opinion; India, Pakistan, Turkey and Afghanistan voted against (C1-101).
- Britain: abstained (C1-060).
Shared ground (Two Lenses `partition`): the vote was 33-13-10; it was a recommendation; the Jewish state would have had a large Arab minority, the Arab state almost no Jews.

Gameplay: a map-and-decision mission. The player is a secretariat staffer (COMP) preparing a briefing note. The result of the vote cannot be changed.

Beats:
1. Briefing in the corridor (`vote.b1-b5`).
2. Map room (cp1): toggle layers (proposed zones, Jerusalem corpus separatum, Peel 1937 zones for comparison: about 225,000 Arabs in the proposed Jewish area, about 1,250 Jews in the proposed Arab area, C1-058). Read `vote.map1-3`.
3. Statement matching (cp2): match four statements (`vote.s.*`) to the parties.
4. Questions (cp3): choose one clarifying question per delegation (for example "what does your side say about Jerusalem?"). Every choice is valid; each reveals a different sourced line. No right/wrong; the point is hearing all sides.
5. Briefing note (cp4): drag the points into the note; the note must contain at least one point per party.
6. The vote (cp5): the radio reads the count (a reconstructed announcer). Warm moment `vote.moment`: a street radio, neighbors listening in their own languages.
7. Debrief (`vote.d1-d3`) then Two Lenses `partition`.

Objectives `vote.o1..o5`; interactables: layered map table, statement cards, question chooser, note pad, radio.

Failure conditions (texts `vote.f1..f3`):
- A statement is assigned to the wrong party twice -> f1 shows the ICJ draft and its 21-20 defeat (C1-101).
- The player tries to alter the vote count -> f2: the historical result, 33-13-10 (C1-060).
- The note omits Jerusalem -> f3: corpus separatum (C1-060).
Hints `vote.h1..h3`.

Bot script outline:
- cp1: open the map, toggle each layer once.
- cp2: drag each of the 4 statements to its matching party.
- cp3: choose the first question for each delegation.
- cp4: add one point per party to the note, include Jerusalem.
- cp5: press "listen" and wait for the radio.

---

## Chapter cutscene

`ch01.stockade-and-radio` (90 s, REC, sources C1-065, C1-060, C1-101): dusk over a newly built stockade, a lit window in a nearby Arab village, then November 1947 and a radio reading the vote count; then quiet in different homes. No real person speaks. All violence is off-screen. Scene events: `stockade-dusk`, `searchlight-on`, `village-window`, `radio-glow`, `radio-count`.

## Facts the lead asked for but that are not approved (left out)

- Ottoman land-law leftovers or a "one-night building" law as the reason for tower-and-stockade speed (C1-F1, C1-F2 HOLD).
- UNSCOP details (report date, majority/minority plans).
- Percentages of land and population on the Zionist side for 1947 (Hallbrook 6.6 percent, C1-Q15 HOLD); only Khalidi's and Hadawi's figures, attributed, are used.
- Trumpeldor's last words, Wingate and the Special Night Squads, Haganah/Lehi/Palmach, Atlit, the Jewish Brigade, Cyprus camp conditions.
- Palestinian-authored account of tower-and-stockade sites; Zionist-authored source for the 1947 reaction; Druze and Bedouin voices (the Druze abstract C1-109 is partial and is not cited).
