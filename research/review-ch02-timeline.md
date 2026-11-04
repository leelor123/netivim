# Review: Chapter 2 (1948) timeline events and Two Lenses

Reviewer: fresh fact-checker, 2026-11-04. Scope: 15 ch02 events (`src/content/eras.ts`), `timeline.era.ch02.*`, `timeline.lens.*`, `timeline.note.*`, place sources in `src/features/livingMap/{lenses,markers}.ts`. Every source below was opened (page or PDF text read) and is registered as C2-101..C2-130 in `SOURCES.md` (YES-FC). Wikipedia was used only to find leads. The old C2-001..C2-074 IDs (Wikipedia indexes, unopened books) are no longer cited anywhere in scope.

## Counts
| Type | Count |
|---|---|
| Events verified and kept, text corrected or sharpened | 15 of 15 (11 with a factual correction, 4 re-sourced only) |
| Lens bodies rewritten | 2 |
| Place captions rewritten | 8 (3 pairs + negba + kfar-etzion) |
| Claims removed (not verifiable from opened sources) | 12 |
| Source IDs replaced | all C2-0xx citations in eras.ts, lenses.ts, markers.ts |

## Events (before -> after, reason, source)
| Event | Change | Source |
|---|---|---|
| civilwar-1947 | "about 1,000 killed in the first two months (Gelber)" REMOVED (Gelber not opened). Now: 30 Nov bus shooting near Lydda airport, 5 killed; Morris: Arab attacks on Jewish communities at end of 1947 opened the war; each side tried to clear neighbours from mixed areas | C2-129, C2-105 |
| nachshon-1948 | Range 5-16 April -> 6 April (IDF account). "1,800 of 3,000 tons" REMOVED (Wikipedia only). Added brigade of about 1,500 men; convoys reached the city, road closed again soon after | C2-114 |
| deiryassin-1948 | "93-254, accepted estimate about 110" -> disputed range with who reports: first reports about 250; Birzeit up to 107; Tauber 2017: 101; Al Jazeera: more than 110. "supported by Haganah and Palmach" REMOVED (not in opened sources; Shaltiel's conditional consent is kept in the caption). 93 (Pappe) and 100-110 (Morris) are Wikipedia-only, dropped | C2-110, C2-109, C2-108 |
| hadassah-1948 | "about 79 killed" -> 78 Jews plus one British soldier (80 in another source). The "Geneva Convention / Arab claim of fighters" sentence REMOVED (unopened); replaced by al-Husayni's own 17 March statement about the Mount Scopus institutions, and "causes disputed" | C2-115, C2-116, C2-117 |
| vote-may-1948 | "6 of 10 supported the declaration" -> 6 to 4 to reject the American trusteeship proposal and proceed to declare | C2-104 |
| declaration-1948 | Kept 16:00 and the Tel Aviv Museum ("shortly after 16:00", small hall); added the Declaration's own basis (historic right plus Res. 181) and its appeal to Arab inhabitants (citizenship, equal); Mandate ended at midnight | C2-101, C2-104, C2-102 |
| armies-1948 | Added the Arab League's own stated reason (cable of 15 May: "intervention" to restore order). US recognition "minutes after midnight" -> exact: 6:11 p.m. EST = 11 minutes after midnight in Palestine; de facto, to the provisional government | C2-125, C2-111, C2-102, C2-103 |
| latrun-1948 | "further attacks until July failed" -> only the verified second attack (1 June) failed | C2-118 |
| negba-1948 | Now primary: Ben-Gurion diary 2 June (Egyptian armoured attack). Added siege until 9 Nov | C2-119, C2-130 |
| burma-1948 | "completed 14 June" REMOVED (unsupported). Now: bypass found by chance in June 1948, later widened; opened 7 Dec 1948 as "Road of Heroism". Date reduced to month; event moved before negba to keep the date-order test | C2-113 |
| dani-1948 | End date 19 July REMOVED. "50,000-70,000" kept as a range with who: 50,000 (Rabin as quoted by Morris), 60,000-70,000 (Al Jazeera). "historians disagree on the order" replaced by the documented written order signed by Rabin (Shavit) | C2-111, C2-108, C2-112 |
| bernadotte-1948 | "murdered by Lehi" -> accurate attribution chain: "Fatherland Front" claimed it, Israel told the UN it was probably Lehi-linked; Col. Serot also killed | C2-121, C2-120 |
| res194-1948 | Vote and para. 11 confirmed. Added who voted against. "Contested to this day" now stated with both readings (Palestinian right-of-return basis; HU legal-workshop view that the text says no "right") | C2-122, C2-105 |
| armistice-1949 | Added Jordan signed at Rhodes, Iraq signed none, lines are not borders and prejudice no claims. Lebanon's place of signing NOT stated (unverified) | C2-113, C2-123, C2-124 |
| uvda-1949 | Added "without a battle", Negev Brigade, ink flag; 20 July 1949 attributed correctly (last armistice) | C2-126, C2-127, C2-113 |
| era ch02 title/summary | unchanged (no claims) | |

## Lenses and captions
- **Independence body**: now in the Declaration's own terms (historic right + Res. 181, appeal to Arab residents, defence against local forces and Arab armies), plus the 1948 Israeli narrative that flight was war and fear, and Morris's later documentation of expulsions without a general policy. Sources C2-101, C2-105.
- **Nakba body**: same four-part structure: definition in Palestinian terms (loss of homeland, collapse of society), the dominant Arab narrative (planned systematic expulsion) and Res. 194 as basis for return, then the disputed figures with who reports them (Israel then about 500,000; Arab governments 900,000 to 1,000,000; UN committee 711,000 in Aug 1949), then locality counts 369 / 418 / 531 with the note that they include towns and tribes (the old text called them all villages). Sources C2-105, C2-106, C2-107, C2-122.
- **tel-aviv**: independence = reading time/place + the 12 May vote; nakba = Morris stages (about 75,000 elite Dec-Mar, about a quarter million by June). Old "250,000-300,000 by 14 May" REMOVED: the opened source gives the quarter-million for the period to June, not to 14 May.
- **lod-ramle**: independence = Rabin's stated security reasoning (as quoted) and Morris's "no general policy, but an atmosphere of transfer"; nakba = 50,000-70,000, mosque deaths 80-176 (Al Jazeera), Shavit's 250 in Lydda, "extent disputed". Both keep the words "מבצע דני" and (deir-yassin nakba) "טבח" that the e2e test checks.
- **deir-yassin**: independence = Shaltiel's conditional letter, escape corridor, Tauber 101 (61 in combat); nakba = about 750 residents, more than 110 (Al Jazeera), up to 107 (Birzeit), symbol of the Nakba.
- **negba**, **kfar-etzion** (independence only): Kfar Etzion "127 killed (127-129)" and the "revenge" version attributed to the Arab Legion REMOVED (not in opened sources); kept: fell 13 May after a two-day battle, defenders fired on while assembling to surrender, four survived (Israeli account, labelled as such).

## Hebrew edits
Natural modern Hebrew, one set of terms (מינהלת העם, הוועדה לפיוס, עבר הירדן, אל־ג׳זירה, טאובר, ל־/ב־ with maqaf before numerals), "ללח״י/האצ״ל" fixed, "גילברט" (a misattributed name in the old Kfar Etzion note) removed. No Latin phrases remain, so no bidi isolates were needed.

## Not verified / held (no opened source)
Gelber's 1,000 in two months; Nachshon tonnage; Hadassah "79" as a single figure and the Geneva Convention dispute; Kfar Etzion 127-129 and the Arab Legion version; Pappe 93 and Morris 100-110 for Deir Yassin (Wikipedia only); 250,000-300,000 before 14 May; Burma Road 14 June; Operation Danny end date; Lebanese armistice location. Morris's 50,000 and "drive them out" are quoted via the PLO NAD site (C2-112) and Shavit, not from the book.

## Code and test touches outside the owned list (need your OK)
1. `tests/unit/livingMapLenses.test.ts`: its register loader read only `research/sources-ch0N.md`; it now also reads `SOURCES.md` (same as timelineEras.test.ts). Without it the new IDs fail.
2. `tests/e2e/timeline.spec.ts` lines 159 and 164 still expect `C2-004` and `C2-003`; they must become `C2-101` and `C2-105`. Not run here (e2e is outside the required gates) and not edited.
3. `src/features/livingMap/layers.ts` line 39 (armistice layer) still cites `C2-008`, `C2-066`; the verified replacements are C2-123, C2-124, C2-113.

## Remaining concerns
- Captions are asymmetric: Negba and Kfar Etzion have an Israeli-lens caption only because no opened Palestinian-perspective source covers them (PalQuest, IPS, Britannica returned 403).
- Perspective balance of sources: Israeli 15 (state, press, archives), Palestinian or Arab 6 (Al Jazeera, IPS, NAD, Abu Sitta, Arab League cable, Birzeit via IPS/JVL), international/UN/US 9. More Palestinian scholarship (Khalidi, Masalha) should be opened when reachable.
- Gates: lint 0 warnings, typecheck, `npm test` (520/520), build all green.
