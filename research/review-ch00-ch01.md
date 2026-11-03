# Content review: Prologue (ch00) and Chapter 1 (ch01)

Reviewer: fresh fact-checker and Hebrew editor, 2026-11-03. Basis: `research/factcheck-ch00-ch01.md` (approved lists), `research/perspectives-ch00-ch01.md` (opened Palestinian, Bedouin, Druze and Old Yishuv sources), `SOURCES.md`, BRIEF section 4 and 5. No new web sources were opened; every change is backed by an ID already verified in those files.

## Summary counts
| Type | Fixes |
|---|---|
| Factual (wrong, unverified or unattributed claims, wrong source IDs) | 45 |
| Fairness (narratives in own terms, paired names, attribution, organizations vs populations) | 17 |
| Labels | 3 |
| Copyright (own translation, quote scope, full Balfour text) | 5 |
| Hebrew (grammar, gender, address form, spelling, terminology, RTL isolates) | 110 |
| Removed or held claims | 12 |

Locale keys changed: 178 (timeline.json 18 plus 1 deleted, ch00.json 52, ch01.json 107), plus 6 data edits in TypeScript and 1 in missions.md. Each key is counted once, under its main reason; many keys also carry Hebrew edits.

## Terminology decisions applied across both chapters
- Place and polity: neutral "הארץ" in narration; for the Mandate and British documents "פלשתינה (ארץ ישראל)" on first use, then "פלשתינה" when translating a document that says "Palestine"; Zionist texts that say Eretz-Israel keep "ארץ ישראל". The people: "פלסטינים". Cutscene title "ארץ ישראל / פלשתינה".
- Paired event names: 1929 = "פרעות תרפ״ט" (Hebrew memory) and "אל־בוראק" (Palestinian); 1936-1939 = "המאורעות" / "המרד הערבי" (Hebrew) and "המרד הפלסטיני הגדול" (Palestinian); Nablus "שכם (נבלוס)".
- Names: "יוסף דיא אל־ח׳אלדי", "רשיד ח׳אלדי", "וליד ח׳אלדי" (was three spellings: ח׳אלדי / ח׳אלידי / ח׳ליד׳י, and יוסף / יוסוף); "בדואים"; "ביירות"; "דוח" (no gershayim); "הייתה" (Academy full spelling, ch01 had "היתה"); "קריין" for the narrator in both chapters (ch01 had "מספר", ambiguous with "number"); "שחזור" for reconstructed (ch01 had "הצגה מחדש"); JVL = "הספרייה היהודית הווירטואלית"; USHMM = "מוזיאון השואה של ארצות הברית"; corpus separatum = "״גוף נפרד״ (קורפוס ספרטום)".
- Player address: plural ("אתם") everywhere, including NPC lines that addressed the player in the masculine singular (Habib, Debora, Jamila).
- Mixed Hebrew and English: English phrases inside Hebrew sentences are wrapped in Unicode first-strong isolates (escaped as `⁨ ... ⁩` in the JSON) so punctuation and gershayim stay on the correct side in RTL: Khalidi and Herzl phrases, The Intercept, the Balfour phrase, the Res 181 phrase, ibiblio.

## Source register (task 5, KNOWN_ISSUES "issue 9")
eras.ts cited P-001, P-003, P-004, P-006, P-008, P-016 to P-019, P-035, C1-003, C1-009 to C1-017, C1-046, C1-049, C1-050. Checked against `research/sources-ch00.md` and `research/sources-ch01.md`: all are Wikipedia indexes ([W]), the unsourced Jerusalem Story lexicon (C1-046) or the unopened UN PDF (C1-003). None is verified, so none was added to SOURCES.md. Instead each event was re-cited to a verified ID or held:

| Event | Before | After | Note |
|---|---|---|---|
| basel-1897 | P-031, P-004, P-003; 29-31 Aug | P-031; August 1897 | Day range was from Wikipedia; month kept |
| khalidi-1899 | P-009, P-008 | P-009 | "ממנהיגי ירושלים" removed (offices UNVERIFIED, P-C03) |
| beersheba-1899 | P-037, P-017, P-038; June 1899 | P-037, P-038; 1899, no month; text says 1899-1900 | P-T14 CONTESTED |
| hashomer-1909 | P-032, P-006 | P-032, P-033 | "היקפו נתון במחלוקת" replaced by "about 40 members in 1914" (P-032) |
| locust-1915 | P-034, P-035 | P-034 | "about 300,000 dead" removed: only in P-035 (Wikipedia) |
| land-code-1858, rishon-1882, railway-1892 | P-018 / P-016, P-001 / P-019 | HELD (not shown) | Corrected texts kept in timeline.json; verified IDs are P-053, P-047, P-055 |
| riots-1929 | C1-009, C1-046 | HELD | Corrected text kept; verified ID C1-059 |
| revolt-1936 | C1-010; 19 Apr, "strike began in Nablus" | HELD | Corrected to 20 Apr call in Nablus, AHC 25 Apr (Peel C1-058, P-T18 CORRECTED) |
| tower-1936 | C1-017 | HELD | Corrected to 55-57 range; verified IDs C1-064, C1-065 |
| peel-1937 | C1-010, C1-050; 7 Jul; "20th Zionist Congress rejected the borders" | HELD | Day and Congress claim UNVERIFIED; Bludan from C1-101; verified IDs C1-058, C1-101 |
| whitepaper-1939 | C1-002, C1-049 | C1-002 | |
| kingdavid-1946 | C1-012 | HELD | Verified IDs C1-061, C1-062 |
| exodus-1947 | C1-011, C1-055; 18-20 Jul; "reached Haifa" | C1-055; July; "about 4,500 aboard, three killed" | Day UNVERIFIED (C1-T31) |
| unscop-1947 | C1-015; 3 Sep 1947 | REMOVED (event and key) | Date UNVERIFIED (C1-T32: possibly 31 Aug) |
| vote-1947 | C1-003, C1-057 | C1-057 | |

Why some events are held rather than re-cited: `tests/unit/timelineEras.test.ts` (not owned by this review) accepts only IDs listed in `research/sources-ch0N.md`, and the verified IDs C1-058 to C1-067, C1-1xx and P-043 to P-057 exist only in SOURCES.md. Re-citing them breaks that test; leaving the Wikipedia IDs breaks BRIEF 5. Restoring each held event is a one-line change in eras.ts once the test also reads SOURCES.md (recommended fix for the timeline owner):

```ts
{ id: 'land-code-1858', year: 1858, textKey: 'timeline.event.land-code-1858', label: 'documented', sources: ['P-053'] },
{ id: 'rishon-1882', year: 1882, textKey: 'timeline.event.rishon-1882', label: 'documented', sources: ['P-047'] },
{ id: 'railway-1892', year: 1892, month: 9, day: 26, textKey: 'timeline.event.railway-1892', label: 'documented', sources: ['P-055'] },
{ id: 'riots-1929', year: 1929, month: 8, day: 23, endMonth: 8, endDay: 29, textKey: 'timeline.event.riots-1929', label: 'documented', sources: ['C1-059', 'C1-101'] },
{ id: 'revolt-1936', year: 1936, month: 4, day: 20, textKey: 'timeline.event.revolt-1936', label: 'documented', sources: ['C1-058'] },
{ id: 'tower-1936', year: 1936, month: 12, day: 10, textKey: 'timeline.event.tower-1936', label: 'documented', sources: ['C1-064', 'C1-065'] },
{ id: 'peel-1937', year: 1937, month: 7, textKey: 'timeline.event.peel-1937', label: 'documented', sources: ['C1-058', 'C1-101'] },
{ id: 'kingdavid-1946', year: 1946, month: 7, day: 22, textKey: 'timeline.event.kingdavid-1946', label: 'documented', sources: ['C1-061', 'C1-062'] },
```
`CH00_HISTORY_COVERED.eraEventIds` in ch00/chapter.ts was trimmed to the shown events. SOURCES.md has a new closing section recording this.

## Data changes (TypeScript)
- `src/content/ch00/chapter.ts`: archive `basel-program` sources P-044, P-031 -> P-044, P-043 (provenance names the Jewish Encyclopedia; P-031 is PRIOR-only and its transcription layer is CC BY-SA). Testimony `composite-village` sources P-101, P-053 -> P-101, P-057 (the body now rests on the population table, not the land code). eraEventIds trimmed.
- `src/content/ch01/dialogue.ts`: narrator lines without sources were labeled `composite`; the narrator is not a composite character, so they are now `reconstructed` (labels fix). Two Lenses `immigration` sources + C1-059 (17 May 1939 date) and C1-055 (post-war ships).
- `src/content/ch01/missions.md`: White Paper "75,000 ... plus 25,000 refugees" -> the 25,000 are within the 75,000 (C1-002: 10,000 a year for five years plus 25,000 refugees = 75,000).
- `src/content/eras.ts`: see the table above.

## Main factual corrections (reasons)
- White Paper arithmetic (ch01 landing.b2, quiz, codex, lens, archive): "75,000 and another 25,000 refugees" implied 100,000; the 25,000 are part of the 75,000 (C1-002).
- Balfour archive re-creation omitted the final clause ("or the rights and political status enjoyed by Jews in any other country"); full text now given in our own translation (C1-001, public domain). "The letter promised" -> "expressed support" ("view with favour").
- Mandate "signed in London" -> "approved in London" by the League Council (C1-005 "Done at London"; in force Sept 1923, C1-059).
- Exodus "stopped and did not reach the shore" was misleading; now "stopped by the British; three passengers killed" (C1-055).
- King David: "Haganah condemned it" alone was one-sided; now "approved in advance (Hoffman) and condemned publicly" (C1-061). Begin entry adds Hoffman's finding on the warning. Victims "and a few others" -> "and five others" (41+28+17+5 = 91, C1-061). Injured range attributed: about 70 (Hoffman) vs 45 (JVL).
- 1929 Hebron toll "between about 60 and 70" now says who reports what: more than 60 (C1-059), 67 (JVL, C1-105).
- Revolt lens: strike end 11 Oct 1936 now sourced (C1-101, C1-103); AHC "headed by" the Mufti (was "a member" in one entry and "headed by" in another).
- Tel Hai: "six died in March and two more in January" reordered and clarified.
- Jaffa 1921: Arab dead now noted as many killed in police and military action (C1-106 per perspectives T3).
- Herzl Congress attendance shown as attributed range (150 Jewish Encyclopedia 1906, about 200 JVL); 208 not used.
- Railway: "the line opened on 26 Sep 1892" -> "the first train from Jaffa reached Jerusalem on 26 Sep 1892" (P-055 wording).
- Beersheba: added "as an administrative centre for the Bedouin" (P-Q6) and the 1899-1900 range (P-T14); "built by Arab-Palestinian urbanites" kept with attribution.
- Hashomer: added its verified aim "instead of non-Jewish guards" (P-032), which matters for the Arab side; ch01 claim "a source of organized Jewish self-defense" removed (not in approved list).
- Basel archive: "(in Arabic: Palestine)" was wrong; the German original says "Palästina", now "במקור הגרמני כתוב ״פלשתינה״".
- Vote map figures given in square miles now also in km² (arithmetic conversion), still attributed to Walid Khalidi.

## Fairness changes
- Ch00 lens titles were asymmetric ("supporters of Jewish settlement" vs "Palestinian historians"); now "בצד הציוני" / "בצד הפלסטיני", matching ch01.
- 1929 Zionist lens rewritten in its own terms ("פרעות תרפ״ט", attack on a non-Zionist ancient community); Palestinian lens rewritten from Walid Khalidi's own framing (Revisionist demonstration seen as designs on the Haram al-Sharif mosques, fear for land and livelihood), with attribution.
- Revolt lenses: each side's name for the period; Zionist lens no longer just "a violent revolt hurt Jews and British".
- Partition Palestinian lens now attributed to Walid Khalidi and tied to Res 181 (it mixed Peel and UN figures).
- Tower b2 called "tower and stockade" and "the Great Palestinian Revolt" "two names for the same year": a factual and fairness error (one is a settlement method, the other a revolt). Now pairs the two names of the revolt.
- Composite village testimony: "the country was settled also by Arab villages" understated the Arab majority; now "most inhabitants were Arabs" (P-057).
- Old Yishuv composite: "every letter is a meal" -> "sometimes the month's livelihood" (less reductive, matches P-054).
- Khalidi archive card now says which phrase is from al-Khalidi and which from Herzl, with Hebrew glosses.
- Organizations kept distinct from populations: "Irgun" not "Jews", "Arab Higher Committee" not "the Arabs", "Britain" not "the British people" where it is policy.

## Copyright
- Herzl diary: provenance now states the phrase is our own translation from the public-domain German, not the 1960 English translation.
- Balfour: full 67-word declaration as our own Hebrew translation of a public-domain text.
- Basel: provenance cites JVL and the Jewish Encyclopedia (PD 1906); no Wikisource transcription layer used.
- Res 181: one short English phrase plus Hebrew gloss; the rest is our summary (UN reuse terms unconfirmed). Peel and AACI: short typeset excerpts, no scan.
- Mandate and White Paper archive items are summaries in our words of public-domain texts (license `public-domain` kept: the source text is PD; the content test pins this value).

## Removed or held (not shown to the player)
1. "About 300,000 dead in Greater Syria" (locust-1915): Wikipedia only.
2. "Kharkiv" founders of Rishon, "Ottoman immigration limits from 1882": UNVERIFIED (P-T07).
3. "86.5 km" railway length: UNVERIFIED (P-C16).
4. Land Code "registration favored merchants and notables": UNVERIFIED (P-T02).
5. Al-Khalidi "one of Jerusalem's leaders": offices UNVERIFIED (P-C03).
6. Peel "20th Zionist Congress rejected the borders but approved negotiation": UNVERIFIED.
7. Peel day 7 July, revolt day 19 April, Exodus days 18-20 July: UNVERIFIED or CORRECTED.
8. UNSCOP 3 Sep 1947 event: UNVERIFIED; key deleted.
9. Hashomer "source of organized Jewish self-defense" (ch01 codex): not in the approved list.
10. Timeline events held for the test conflict: land-code-1858, rishon-1882, railway-1892, riots-1929, revolt-1936, tower-1936, peel-1937, kingdavid-1946 (texts corrected and kept).

## Remaining concerns
- The eight held timeline events (above) leave the Chapter 1 timeline without 1929, the revolt, Peel and King David. Fix needs the timeline owner: make `timelineEras.test.ts` also accept SOURCES.md IDs, then paste the lines above.
- KNOWN_ISSUES item 4 (Wikipedia-as-index in eras.ts) is resolved for prologue and ch01; ch02 events still cite C2- research IDs (out of scope). KNOWN_ISSUES.md was not edited (not owned).
- Zionist-side lenses still rest mainly on JVL and Israeli heritage pages; no Zionist-authored primary source for the 1947 acceptance is in the approved set (gap noted in missions.md). Druze and Bedouin voices appear only in research files, not yet in game text.
- Isolates (U+2068/U+2069) were checked for JSON validity and tests; a visual check on device is still advised.
- `timeline.lens.*` and `timeline.note.*` (ch02, Living Map) were not reviewed beyond a spelling fix (ח׳אלידי -> ח׳אלדי).

## Full before -> after log (locale keys)

### src/locales/he/timeline.json
- `timeline.event.land-code-1858`
  - before: חוק הקרקעות העות׳מאני חייב לרשום בעלות על קרקע. בפועל הרישום הועיל לא פעם לסוחרים ולנכבדים יותר מאשר לאיכרים שעיבדו את האדמה.
  - after: חוק הקרקעות העות׳מאני (1858) וחוק הטאפו (1859 בקירוב) הסדירו את ההחזקה בקרקע ואת רישום הזכויות בה.
- `timeline.event.rishon-1882`
  - before: ראשון לציון נוסדה בידי עשרה מחובבי ציון מחרקוב. באותה שנה החלו השלטונות העות׳מאניים להגביל את ההגירה היהודית.
  - after: ראשון לציון נוסדה בידי עשרה חלוצים מרוסיה בהנהגת ז״ד לבונטין. חברי ביל״ו הצטרפו אליהם בשנה הראשונה.
- `timeline.event.railway-1892`
  - before: נפתחה מסילת הברזל יפו–ירושלים, באורך של כ־86.5 ק״מ. הזיכיון ניתן ליוסף נבון.
  - after: הרכבת הראשונה מיפו הגיעה לירושלים. את הזיכיון לקו, ל־71 שנים, קיבל יוסף נבון.
- `timeline.event.basel-1897`
  - before: הקונגרס הציוני הראשון התכנס בבזל ואימץ את תוכנית בזל, שקראה להקים לעם היהודי בית בארץ ישראל, מובטח במשפט הציבורי.
  - after: הקונגרס הציוני הראשון התכנס בבזל ואימץ את תוכנית בזל, שקראה ליצור לעם היהודי בית בארץ ישראל, מובטח במשפט הציבורי.
- `timeline.event.khalidi-1899`
  - before: יוסף דיא אל־ח׳אלידי, ממנהיגי ירושלים, כתב לרב הראשי צדוק כהן וביקש שהציונים יניחו לארץ. הרצל השיב ב־19 במרץ ושאל מי יחשוב לגרש את האוכלוסייה הלא־יהודית. היסטוריונים פלסטינים, ובהם רשיד ח׳אלידי, קוראים את המכתב כאזהרה מוקדמת.
  - after: יוסף דיא אל־ח׳אלדי מירושלים כתב לרב הראשי של צרפת, צדוק כהן, וביקש שהציונים יניחו לארץ. הרצל השיב ב־19 במרץ ושאל מי יעלה בדעתו לסלק את התושבים הלא־יהודים. היסטוריונים פלסטינים, ובהם רשיד ח׳אלדי, קוראים את המכתב כאזהרה מוקדמת.
- `timeline.event.beersheba-1899`
  - before: השלטון העות׳מאני הורה להקים נפת באר שבע ולתכנן עיר בתבנית רשת. הרשויות הציגו אותה כמיזם עבור הבדווים, אך רוב המהנדסים, הבנאים והסוחרים בה היו ערבים עירוניים מהארץ.
  - after: בשנים 1899–1900 בקירוב הקים השלטון העות׳מאני נפה חדשה בבאר שבע ותכנן בה עיר בתבנית רשת, כמרכז מנהלי לשבטים הבדואים. רוב המהנדסים, הבנאים והסוחרים בה היו ערבים פלסטינים מהערים.
- `timeline.event.hashomer-1909`
  - before: השומר הוקם במש׳ה (כפר תבור) כדי לזכות במקום לשמור ולעבוד במושבות במקום שומרים לא־יהודים. היקפו נתון במחלוקת בין המקורות.
  - after: ארגון ״השומר״ הוקם במסחה (כפר תבור) כדי לזכות בשמירה ובעבודה במושבות במקום שומרים לא־יהודים. ב־1914 מנה כ־40 חברים.
- `timeline.event.locust-1915`
  - before: בשנת 1915 פקדה מכת חגבים את סוריה הגדולה. לצד גיוס, הפקעות ומצור ימי היא תרמה לרעב קשה שפגע בכל העדות. אומדן אחד מדבר על כ־300,000 מתים ברחבי סוריה הגדולה; נתון מבוסס לארץ ישראל עצמה אינו ידוע.
  - after: ב־1915 פקדה מכת ארבה את סוריה הגדולה. לצד גיוס, הפקעות ומצור ימי, היא החמירה את המחסור והרעב, שפגעו בכל העדות.
- `timeline.event.balfour-1917`
  - before: שר החוץ הבריטי בלפור שלח לורד רוטשילד מכתב המביע תמיכה בהקמת בית לאומי לעם היהודי בארץ ישראל. ההיסטוריוגרפיה הפלסטינית רואה בו את שורש העקירה.
  - after: שר החוץ הבריטי ארתור בלפור שלח ללורד רוטשילד מכתב שבו הביעה ממשלת בריטניה תמיכה בהקמת בית לאומי לעם היהודי בפלשתינה (ארץ ישראל). בהיסטוריוגרפיה הפלסטינית הוא נחשב לשורש אובדן המולדת.
- `timeline.event.mandate-1922`
  - before: נוסח המנדט על ארץ ישראל נמסר למועצת חבר הלאומים. בפתיחתו מוזכרת הצהרת בלפור.
  - after: מועצת חבר הלאומים אישרה בלונדון את כתב המנדט הבריטי על פלשתינה (ארץ ישראל). בפתיחתו מוזכרת הצהרת בלפור.
- `timeline.event.riots-1929`
  - before: אלימות קשה בין יהודים לערבים, בין היתר בחברון (24 באוגוסט) ובצפת (29 באוגוסט), לאחר עימות סביב הכותל המערבי (אל־בוראק). יהודים וערבים נהרגו, ומספרי ההרוגים נתונים במחלוקת בין המקורות.
  - after: אחרי מתיחות סביב הכותל המערבי (אל־בוראק) פרצה ב־23 באוגוסט אלימות בירושלים, והיא התפשטה לחברון ולצפת. לפי הוועדה האנגלו־אמריקנית (1946), 133 יהודים נהרגו, וכן 116 ערבים, רבים מהם בידי המשטרה והצבא.
- `timeline.event.revolt-1936`
  - before: פרצה שביתה כללית ערבית שהחלה בשכם, ופתחה את המרד הערבי הגדול (1936–1939).
  - after: ועד לאומי ערבי בשכם (נבלוס) קרא לשביתה כללית, וב־25 באפריל הוקם הוועד הערבי העליון. כך החל המרד הערבי הגדול (1936–1939).
- `timeline.event.tower-1936`
  - before: תל עמל (ניר דוד) הוקמה ונחשבת לראשונה ביישובי חומה ומגדל. עד אוקטובר 1939 הוקמו 57 יישובים כאלה.
  - after: הוקמה תל עמל (ניר דוד), שמתוארת כיישוב הראשון בשיטת חומה ומגדל. עד 1939 הוקמו כך 55 עד 57 יישובים, לפי מקורות שונים.
- `timeline.event.peel-1937`
  - before: ועדת פיל פרסמה המלצה לחלק את הארץ. הקונגרס הציוני ה־20 דחה את גבולות התוכנית אך אישר משא ומתן, וועידת בלודאן הערבית דחתה את החלוקה.
  - after: ועדת פיל הבריטית פרסמה דוח שהמליץ לחלק את הארץ. ועידת בלודאן הערבית (ספטמבר 1937) דחתה את החלוקה.
- `timeline.event.whitepaper-1939`
  - before: הספר הלבן של בריטניה הגביל את ההגירה היהודית ל־75,000 איש בחמש שנים, הגביל העברת קרקעות וקבע שתוקם מדינה בתוך עשר שנים.
  - after: הספר הלבן הבריטי הגביל את העלייה היהודית ל־75,000 איש בחמש שנים, הגביל העברת קרקעות וקבע שבתוך עשר שנים תקום מדינה עצמאית.
- `timeline.event.kingdavid-1946`
  - before: האצ״ל פוצץ אגף במלון המלך דוד בירושלים. 91 בני אדם נהרגו.
  - after: האצ״ל פוצץ אגף במלון המלך דוד בירושלים, ששימש את השלטון הבריטי. 91 בני אדם נהרגו: ערבים, בריטים, יהודים ואחרים.
- `timeline.event.exodus-1947`
  - before: ספינת המעפילים אקסודוס 1947 נתפסה בידי הבריטים והגיעה לחיפה. כ־4,500 איש היו על סיפונה.
  - after: בריטניה עצרה את ספינת המעפילים ״אקסודוס 1947״. על סיפונה היו כ־4,500 פליטים, ושלושה מהם נהרגו.
- `timeline.event.vote-1947`
  - before: עצרת האו״ם אישרה את החלטה 181 על חלוקת הארץ למדינה יהודית, מדינה ערבית וירושלים בינלאומית: 33 בעד, 13 נגד ו־10 נמנעים.
  - after: עצרת האו״ם אישרה את החלטה 181 על חלוקת הארץ למדינה יהודית, למדינה ערבית ולירושלים בינלאומית: 33 בעד, 13 נגד ו־10 נמנעים.
- `timeline.event.unscop-1947` REMOVED (was: ועדת האו״ם לענייני פלשתינה (אונסקו״פ) הגישה את דוח המלצותיה לעצרת.)

### src/locales/he/ch00.json
- `ch00.history.period`
  - before: ארץ ישראל העות׳מאנית, כ־1850 עד 1918
  - after: הארץ בשלהי התקופה העות׳מאנית, כ־1850 עד 1918
- `ch00.brief.jaffa.body`
  - before: יפו, שנות התשעים של המאה ה־19. אתם שליחים של משרד סוחרים, והתיק מלא מכתבים וחבילות. הדמויות מומצאות, אבל המקומות, הרכבת והמושבות אמיתיים. יש לכם יום אחד, והדרך עוברת בכל העולמות.
  - after: יפו, שנות התשעים של המאה ה־19. אתם שליחים של משרד סוחרים, והתיק מלא מכתבים וחבילות. הדמויות מומצאות, אבל המקומות, הרכבת והמושבות אמיתיים. יש לכם יום אחד, והדרך עוברת בין כל העולמות האלה.
- `ch00.debrief.chapter.body`
  - before: בפרולוג ראינו שהארץ הייתה מורכבת הרבה לפני המלחמות. על הקרקע והחוכרים יש יותר מסיפור אחד, ושניהם מוצגים כאן. עכשיו אפשר לצאת אל הפרק הראשון.
  - after: בפרולוג ראינו שהארץ הייתה מורכבת הרבה לפני המלחמות. על הקרקע ועל מי שעיבדו אותה יש יותר מסיפור אחד, ושני הסיפורים המרכזיים מוצגים כאן. עכשיו אפשר לצאת אל הפרק הראשון.
- `ch00.hub.after.jaffa.samir`
  - before: בשיחה על קפה כולם מסכימים. תנצלו את זה.
  - after: על כוס קפה כולם מסכימים. נצלו את זה.
- `ch00.hub.chapter.complete.samir`
  - before: מכאן הדרך מסתבכת. תשמרו על סקרנות, וגם על לב פתוח.
  - after: מכאן הדרך מסתבכת. שמרו על הסקרנות, וגם על לב פתוח.
- `ch00.line.jaffa.port_start.habib`
  - before: בוקר טוב. זה התיק שלך. מכתבים וחבילות לשלושה מקומות. את הסדר תחליטו אתם.
  - after: בוקר טוב. זה התיק שלכם: מכתבים וחבילות לשלושה מקומות. את הסדר תחליטו אתם.
- `ch00.line.jaffa.loaded.habib`
  - before: עגלה אחת יכולה לשאת רק כך וכך. בחרו מה עולה ראשון.
  - after: עגלה אחת יכולה לשאת רק משקל מוגבל. בחרו מה עולה ראשון.
- `ch00.line.jaffa.colony_delivered.debora`
  - before: הגעת! ממתינים לחלקים של הבאר מזה ימים. תשתה משהו? יש תה קר.
  - after: הגעתם! אנחנו מחכים לחלקים של הבאר כבר ימים. תשתו משהו? יש תה קר.
- `ch00.line.jaffa.village_arrival.narrator`
  - before: הכפר שוכן בין שדות. הילדים רצים לקראתכם.
  - after: הכפר שוכן בין השדות. ילדים רצים לקראתכם.
- `ch00.line.jaffa.village_delivered.jamila`
  - before: מכתב מאחי ביפו! ובוא תשב רגע. הקפה כבר מוכן.
  - after: מכתב מאחי ביפו! בואו, שבו רגע. הקפה כבר מוכן.
- `ch00.line.jaffa.complete.samir`
  - before: וזה בדיוק העניין. אחר כך נראה איך האנשים האלה נשאבים לסערה גדולה.
  - after: וזה בדיוק העניין. בהמשך נראה איך האנשים האלה נסחפים לסערה גדולה.
- `ch00.fail.missed-train.body`
  - before: מה שקרה באמת: קו הרכבת מיפו לירושלים נפתח ב־26 בספטמבר 1892. את הזיכיון לבניית הקו, ל־71 שנים, קיבל יוסף נבון.
  - after: מה שקרה באמת: הרכבת הראשונה מיפו הגיעה לירושלים ב־26 בספטמבר 1892. את הזיכיון לקו, ל־71 שנים, קיבל יוסף נבון.
- `ch00.fail.wrong-addressee.body`
  - before: מה שקרה באמת: בישוב הישן בירושלים, כסף ומכתבים מיהודי התפוצות, ה״חלוקה״, היו גורם מכריע בפרנסה. אצל משפחות רבות כל מכתב כזה היה חשוב. לכן חשוב להגיע לכתובת הנכונה.
  - after: מה שקרה באמת: בישוב הישן בירושלים, ה״חלוקה״, כספים שנשלחו מיהודי התפוצות, הייתה גורם מכריע בפרנסה. לכן כל מכתב כזה היה חשוב, וחשוב להגיע לכתובת הנכונה.
- `ch00.fail.field-crossing.body`
  - before: מה שקרה באמת: על הקרקע בתקופה העות׳מאנית חלו חוק הקרקעות משנת 1858 וחוק הטאפו, רישום הזכויות, משנת 1859 בקירוב. הקרקע הייתה מקור הפרנסה של מי שעיבד אותה.
  - after: מה שקרה באמת: על הקרקע בתקופה העות׳מאנית חלו חוק הקרקעות (1858) וחוק הטאפו לרישום זכויות (1859 בקירוב). לאיכרים, השדה היה מקור הפרנסה.
- `ch00.fail.colony-no-parts.body`
  - before: מה שקרה באמת: באר הייתה צורך ראשון במושבה. אדמונד דה רוטשילד תרם 25,000 פרנק לבאר בראשון לציון. בלי חלקים אין מים, ובלי מים אין חקלאות.
  - after: מה שקרה באמת: באר הייתה צורך ראשון במושבה. הברון אדמונד דה רוטשילד תרם 25,000 פרנק לבאר בראשון לציון. בלי באר אין מים, ובלי מים אין חקלאות.
- `ch00.lens.land.common`
  - before: מה שמוסכם: בסוף התקופה העות׳מאנית נרכשו קרקעות בארץ לצורכי התיישבות יהודית. בעלי קרקע גדולים, חלקם גרו מחוץ לארץ, למשל בביירות, מכרו חלק מהן. מי שעיבד את האדמה לא היה בהכרח זה שמכר אותה. גם היסטוריונים ערבים וגם מקורות ציוניים מצטטים את אותם נתוני רכישה.
  - after: מה שמוסכם: בסוף התקופה העות׳מאנית נרכשו בארץ קרקעות להתיישבות יהודית. חלק ניכר מהן מכרו בעלי קרקע גדולים, ובהם כאלה שגרו מחוץ לארץ, למשל בביירות. מי שעיבד את האדמה לא היה בהכרח מי שמכר אותה. היסטוריונים פלסטינים ומקורות ציוניים מצטטים את אותם נתוני רכישה.
- `ch00.lens.land.a.title`
  - before: כך מספרים תומכי ההתיישבות היהודית
  - after: כך מספרים בצד הציוני
- `ch00.lens.land.a.body`
  - before: הקרקעות נקנו בכסף מבעלים שרצו למכור. המתיישבים ייבשו ביצות, חפרו בארות והקימו מושבות, ובהם ראשון לציון ופתח תקווה. בסיוע הברון רוטשילד נבנו הדברים הראשונים: באר וייבוש.
  - after: הקרקעות נקנו בכסף מבעלים שרצו למכור. המתיישבים ייבשו ביצות, חפרו בארות והקימו מושבות כמו ראשון לציון ופתח תקווה, בסיוע הברון רוטשילד.
- `ch00.lens.land.b.title`
  - before: כך מספרים היסטוריונים פלסטינים
  - after: כך מספרים בצד הפלסטיני
- `ch00.lens.land.b.body`
  - before: איכרים וחוכרים עיבדו את האדמה במשך דורות. היא נמכרה מעל ראשיהם על ידי בעלים שלא גרו שם, והם איבדו את ביתם ואת פרנסתם. כבר מראשית המאה ה־20 התריעו על כך עיתונים וצירים ערבים.
  - after: איכרים וחוכרים עיבדו את האדמה דורות. בעלים שלא גרו בה מכרו אותה מעל ראשיהם, והם איבדו את ביתם ואת פרנסתם. כבר בראשית המאה ה־20 התריעו על כך עיתונים ערביים וצירים ערבים בפרלמנט העות׳מאני.
- `ch00.lens.land.limits`
  - before: מה שלא ידוע לנו: בפתח תקווה, המקורות חלוקים על זהות המוכרים. מה עלה בגורל מי שעבד שם קודם, המקורות שלנו שותקים. נתונים על היקף הרכישות מתפרסמים בשני הצדדים, ולא נאחד אותם כאן.
  - after: מה שלא ידוע לנו: בפתח תקווה המקורות חלוקים על זהות המוכרים, ועל גורלם של מי שעבדו שם קודם הם שותקים. נתונים על היקף הרכישות מתפרסמים בשני הצדדים, ולא נאחד אותם כאן.
- `ch00.cut.line.5`
  - before: ופעם, לפעמים, מסמך קורא בחזרה.
  - after: ולפעמים, מסמך קורא לנו בחזרה.
- `ch00.codex.yusuf-diya-al-khalidi.title`
  - before: יוסוף דיא אל־ח׳אלדי
  - after: יוסף דיא אל־ח׳אלדי
- `ch00.codex.yusuf-diya-al-khalidi.body`
  - before: ב־1 במרץ 1899 שלח אל־ח׳אלדי מכתב בן שבעה עמודים אל צדוק כהן. הרצל השיב ב־19 במרץ. ההיסטוריון רשיד ח׳אלדי, צאצאו, מביא את המכתב בספרו על מאה שנות המלחמה על פלסטין. בארכיון תמצאו את הקטעים הקצרים ותוכלו לשפוט בעצמכם.
  - after: ב־1 במרץ 1899 שלח אל־ח׳אלדי, איש ירושלים, מכתב בן שבעה עמודים לרב צדוק כהן, וביקש שהציונים יניחו לארץ. הרצל השיב ב־19 במרץ. ההיסטוריון רשיד ח׳אלדי, צאצאו, מביא את המכתב בספרו ״מלחמת מאה השנים על פלסטין״. בארכיון תמצאו קטעים קצרים ותוכלו לשפוט בעצמכם.
- `ch00.codex.filastin-newspaper.body`
  - before: עיתון בערבית שהחל לצאת ביפו ב־15 בינואר 1911 בידי עיסא אל־עיסא ובן דודו יוסוף. לפי כתבה בעיתון הקטארי גאלף טיימס, הרשויות העות׳מאניות סגרו אותו ב־1913 והבריטים ב־1936. המקור עיתונאי ולא אקדמי.
  - after: עיתון בערבית שהחל לצאת ביפו ב־15 בינואר 1911, בעריכת עיסא אל־עיסא ובן דודו יוסף. לפי כתבה בעיתון הקטארי ״גאלף טיימס״, השלטונות העות׳מאניים סגרו אותו ב־1913, והבריטים ב־1936. המקור עיתונאי ולא אקדמי.
- `ch00.codex.hovevei-zion.body`
  - before: העלייה הראשונה (1882 עד 1903) באה אחרי הפרעות ברוסיה ב־1881 וב־1882. בוועידת קטוביץ׳ שנפתחה ב־6 בנובמבר 1884 השתתפו 32 צירים, 22 מהם מרוסיה. ליאון פינסקר ניהל אותה, והיא הקימה את ״אגודת מונטיפיורי״.
  - after: העלייה הראשונה (1882–1903) באה אחרי הפרעות ברוסיה ב־1881–1882. בוועידת קטוביץ׳, שנפתחה ב־6 בנובמבר 1884, השתתפו 32 צירים, 22 מהם מרוסיה. ליאון פינסקר עמד בראשה, והיא הקימה את ״אגודת מונטיפיורי״.
- `ch00.codex.petah-tikva.body`
  - before: הוקמה ב־3 בנובמבר 1878 וכונתה ״אם המושבות״. הברון רוטשילד סייע בייבוש הביצות. מי מכר את הקרקע? המקורות חלוקים. ומה עלה בגורל מי שעבד שם קודם? המקורות שלנו שותקים, והמשחק לא ממלא את החסר.
  - after: הוקמה ב־3 בנובמבר 1878 ומכונה ״אם המושבות״. הברון רוטשילד סייע בייבוש הביצות. מי מכר את הקרקע? המקורות חלוקים. ומה עלה בגורל מי שעבדו בה קודם? המקורות שלנו שותקים, והמשחק לא ממלא את החסר.
- `ch00.codex.edmond-de-rothschild.body`
  - before: לפי המקורות תרם 25,000 פרנק לבאר בראשון לציון, וסייע בייבוש הביצות בפתח תקווה.
  - after: הברון תרם 25,000 פרנק לבאר בראשון לציון, וסייע בייבוש הביצות בפתח תקווה.
- `ch00.codex.herzl-first-congress.body`
  - before: הקונגרס נערך בבזל, בקזינו העירוני, בין 29 ל־31 באוגוסט 1897. מספר המשתתפים שנוי במחלוקת: בין כ־150 לכ־200 ומעלה, לפי המקורות. ב־30 באוגוסט הוגשה טיוטת תוכנית שמטרתה בית לעם היהודי בארץ ישראל, מובטח במשפט הציבורי. ב־3 בספטמבר כתב הרצל ביומנו שהוא ״הקים את המדינה היהודית״.
  - after: הקונגרס נערך בבזל, באולם הקזינו העירוני, ב־29–31 באוגוסט 1897. מספר המשתתפים שנוי במחלוקת: כ־150 לפי האנציקלופדיה היהודית (1906), וכ־200 לפי הספרייה היהודית הווירטואלית. ב־30 באוגוסט הוגשה טיוטת תוכנית שמטרתה בית לעם היהודי בארץ ישראל, מובטח במשפט הציבורי. ב־3 בספטמבר כתב הרצל ביומנו שבבזל ״ייסד את מדינת היהודים״.
- `ch00.codex.hashomer.title`
  - before: בר־גיורא וה״שומר״
  - after: בר־גיורא ו״השומר״
- `ch00.codex.hashomer.body`
  - before: בר־גיורא הייתה אגודה חשאית שהוקמה ביפו ב־1907 בידי כעשרה אנשים. באפריל 1909 הוקם ״השומר״ במסחה (כפר תבור) ביוזמת שוחט, גלעדי ופורטוגלי. מטרתו: הזכות לעבוד ולשמור במושבות. ב־1914 היו בו כ־40 חברים. מבקרים, ובהם העיתונאי תום שגב, בוחנים מחדש את המיתוס סביבו.
  - after: בר־גיורא הייתה אגודה חשאית שהקימו כעשרה אנשים ביפו ב־1907. באפריל 1909 הוקם ״השומר״ במסחה (כפר תבור), ובין מייסדיו שוחט, גלעדי ופורטוגלי. מטרתו: הזכות לעבוד ולשמור במושבות, במקום שומרים לא־יהודים. ב־1914 מנה כ־40 חברים. ההיסטוריון והעיתונאי תום שגב בוחן מחדש חלק מהתדמית שלו, ובה היחסים הטובים עם הערבים, כמיתוס.
- `ch00.codex.beersheba.body`
  - before: סביב 1899 עד 1900 הקימו העות׳מאנים מחוז חדש שנפרד מעזה ובנו בו עיר מתוכננת: רחובות ברשת, בניין עירייה, פארק, בית ממשל, מסגד ופנימייה. לפי פרויקט מחקר גרמני־ישראלי, בנו אותה בעיקר ערבים־פלסטינים מעירוניים.
  - after: בשנים 1899–1900 בקירוב הקימו העות׳מאנים נפה חדשה, שהופרדה מעזה, ובנו בה עיר מתוכננת כמרכז מנהלי לבדואים: רחובות ברשת, בניין עירייה, פארק, בית ממשל, מסגד ופנימייה. לפי פרויקט מחקר גרמני־ישראלי, בנו אותה בעיקר ערבים פלסטינים מהערים.
- `ch00.codex.jaffa-jerusalem-railway.body`
  - before: הרכבת הראשונה מיפו הגיעה לירושלים ב־26 בספטמבר 1892. יוסף נבון קיבל זיכיון ל־71 שנים.
  - after: הרכבת הראשונה מיפו הגיעה לירושלים ב־26 בספטמבר 1892. יוסף נבון קיבל זיכיון לקו ל־71 שנים.
- `ch00.codex.year-of-locusts.body`
  - before: ארבה פגע בגידולים ב־1915 וב־1916, ושנת 1915 נשארה בזיכרון כ״שנת הארבה״. גם גיוס, הפקעות וסגר שבו זה קרה החמירו את המחסור, כך כתבה ההיסטוריונית נג׳וא אל־קטאן.
  - after: ארבה פגע בגידולים ב־1915 וב־1916, ו־1915 נזכרת כ״שנת הארבה״. לפי ההיסטוריונית נג׳וא אל־קטאן, גיוס לצבא, הפקעות ומצור ימי החמירו את המחסור.
- `ch00.archive.basel-program.description`
  - before: המשפט המרכזי: הציונות חותרת ליצירת בית לעם היהודי בארץ ישראל, מובטח במשפט הציבורי. ארץ ישראל (בערבית: פלסטין). הכתב הוא שחזור מודפס, והתרגום שלנו.
  - after: המשפט המרכזי: הציונות שואפת ליצור לעם היהודי בית בארץ ישראל, מובטח במשפט הציבורי. במקור הגרמני כתוב ״פלשתינה״. הטקסט הוא שחזור מודפס, והתרגום שלנו.
- `ch00.archive.basel-program.provenance`
  - before: שחזור מודפס של משפט המטרה, בתרגום שלנו. נוסח 1897 הוא נחלת הכלל. אין כאן העתקה של תרגום או תמלול מוגנים. מקורות: אנציקלופדיה יהודית ו־JVL.
  - after: שחזור מודפס של משפט המטרה, בתרגום שלנו. נוסח 1897 הוא נחלת הכלל; לא הועתקו כאן תרגום או תמלול מוגנים. מקורות: הספרייה היהודית הווירטואלית והאנציקלופדיה היהודית (1906).
- `ch00.archive.herzl-diary-1897.description`
  - before: ביומנו ב־3 בספטמבר 1897, בווינה, כתב הרצל שבבזל ״הקים את המדינה היהודית״. כך הוא ראה זאת אז, ולא כמסקנה מוכרעת.
  - after: ביומנו, ב־3 בספטמבר 1897 בווינה, כתב הרצל שבבזל ״ייסד את מדינת היהודים״. זו הייתה תחושתו האישית באותם ימים, לא עובדה היסטורית.
- `ch00.archive.herzl-diary-1897.provenance`
  - before: קטע קצר בלבד, בציון המקור: היומנים השלמים של הרצל, כרך ב׳, עמוד 581. התרגום האנגלי מוגן בזכויות יוצרים, ולכן הבאנו רק ביטוי קצר.
  - after: ביטוי קצר בלבד, בתרגום שלנו מהמקור הגרמני (נחלת הכלל), בציון המקור: היומנים השלמים של הרצל, כרך ב׳, עמ׳ 581. התרגום האנגלי מוגן בזכויות יוצרים ולא הועתק.
- `ch00.archive.khalidi-letters-1899.description`
  - before: מכתב בן שבעה עמודים מ־1 במרץ ותשובה מ־19 במרץ. רשיד ח׳אלדי מצטט שני ביטויים קצרים: ״let Palestine be left alone״ ו־״who would think of sending them away״.
  - after: מכתב בן שבעה עמודים מ־1 במרץ ותשובה מ־19 במרץ. רשיד ח׳אלדי מביא שני ביטויים קצרים: מהמכתב, ״⁨let Palestine be left alone⁩״ (״שיניחו לפלסטין״), ומתשובת הרצל, ״⁨who would think of sending them away⁩״ (״מי יעלה בדעתו לשלח אותם״).
- `ch00.archive.khalidi-letters-1899.provenance`
  - before: פרפרזה ושני ביטויים קצרים כפי שהם מובאים בספר מאה שנות המלחמה על פלסטין מאת רשיד ח׳אלדי, באתר The Intercept, 2020. את המכתבים המלאים לא קראנו.
  - after: פרפרזה ושני ביטויים קצרים, כפי שהם מובאים בספרו של רשיד ח׳אלדי ״מלחמת מאה השנים על פלסטין״ (קטע שפורסם באתר ⁨The Intercept⁩, 2020). את המכתבים המלאים לא קראנו.
- `ch00.testimony.khalidi-letter-1899.speaker`
  - before: יוסוף דיא אל־ח׳אלדי, כפי שמתאר רשיד ח׳אלדי
  - after: יוסף דיא אל־ח׳אלדי, כפי שמתאר רשיד ח׳אלדי
- `ch00.testimony.khalidi-letter-1899.body`
  - before: ב־1899 כתב אל־ח׳אלדי מכתב מפורט, בן שבעה עמודים, והרצל השיב לו. ההיסטוריון רשיד ח׳אלדי, צאצאו, מביא את המכתב ואת תשובת הרצל בספרו. אנחנו מביאים את התוכן ולא מוסיפים לו מילים.
  - after: ב־1899 כתב אל־ח׳אלדי מכתב מפורט, בן שבעה עמודים, והרצל השיב לו. ההיסטוריון רשיד ח׳אלדי, צאצאו, מביא את המכתב ואת התשובה בספרו. אנחנו מוסרים את התוכן בלי להוסיף לו מילים.
- `ch00.testimony.herzl-diary-1897.body`
  - before: בסוף הקונגרס הראשון כתב הרצל ביומנו שהוא ״הקים את המדינה היהודית״. זהו תיאור אישי של מי שהיה שם, ואנחנו מביאים אותו כך.
  - after: בתום הקונגרס הראשון כתב הרצל ביומנו שבבזל ״ייסד את מדינת היהודים״. זה תיאור אישי של מי שהיה שם, ואנחנו מביאים אותו ככזה.
- `ch00.testimony.composite-old-yishuv.body`
  - before: דמות מורכבת: משפחה מהישוב הישן. מבוססת על התיאור הכללי של ה״חלוקה״, כסף שנשלח מקרובים בחוץ לארץ. עבורה כל מכתב מהדואר הוא ארוחה.
  - after: דמות מורכבת: משפחה מהישוב הישן. מבוססת על התיאור הכללי של ה״חלוקה״, כספים שנשלחו מיהודי התפוצות. בשבילה, מכתב מחוץ לארץ הוא לפעמים הפרנסה של החודש.
- `ch00.testimony.composite-village.body`
  - before: דמות מורכבת: משפחה בכפר ערבי ליד יפו. מבוססת על כך שהארץ הייתה מיושבת גם בכפרים ערביים. בבית שלהם המכתב הוא חג, והאורח מקבל קפה.
  - after: דמות מורכבת: משפחה בכפר ערבי ליד יפו. מבוססת על כך שרוב תושבי הארץ באותה תקופה היו ערבים. בבית שלהם מכתב הוא שמחה, והאורח מקבל קפה.
- `ch00.fact.beersheba-builders`
  - before: לפי פרויקט מחקר של אוניברסיטת בוכום ואוניברסיטת חיפה, את באר שבע העות׳מאנית בנו בעיקר ערבים־פלסטינים מעירוניים.
  - after: לפי פרויקט מחקר של אוניברסיטת בוכום ואוניברסיטת חיפה, את באר שבע העות׳מאנית בנו בעיקר ערבים פלסטינים מהערים.
- `ch00.fact.year-of-locusts`
  - before: ב־1915 שנת הארבה: ארבה פגע בגידולים, וגם גיוס, הפקעות וסגר החמירו את המחסור.
  - after: 1915 נזכרת כ״שנת הארבה״: ארבה פגע בגידולים, וגיוס, הפקעות ומצור ימי החמירו את המחסור.
- `ch00.quiz.beersheba.prompt`
  - before: איזו עיר תכננו העות׳מאנים מאפס, סביב 1899 עד 1900, בסמוך לאזור הבדואים?
  - after: איזו עיר תכננו העות׳מאנים מראש, בשנים 1899–1900 בקירוב, כמרכז מנהלי לבדואים בנגב?
- `ch00.quiz.beersheba.exp`
  - before: באר שבע תוכננה מראש עם רחובות ברשת, בניין עירייה ופארק.
  - after: באר שבע תוכננה מראש, עם רחובות ברשת, בניין עירייה ופארק.
- `ch00.quiz.halukka.exp`
  - before: החלוקה הייתה גורם מכריע בקיום הישוב הישן.
  - after: החלוקה הייתה גורם מכריע בקיומו של הישוב הישן.
- `ch00.quiz.filastin.exp`
  - before: ״פלסטין״ יצא לאור לראשונה ב־15 בינואר 1911, בידי עיסא אל־עיסא ובן דודו.
  - after: ״פלסטין״ יצא לאור לראשונה ב־15 בינואר 1911, בעריכת עיסא אל־עיסא ובן דודו יוסף.

### src/locales/he/ch01.json
- `ch01.contentNote`
  - before: בפרק הזה מוזכרים אלימות בין קהילות (1929), מרד (1936–1939), פיגועים ושואה כרקע. אין בו תיאורים גרפיים. אפשר להמשיך כרגיל או לבחור ברמת תוכן עדינה.
  - after: הפרק עוסק גם באלימות בין קהילות (1929), במרד (1936–1939), בפיגועים ובשואה כרקע. אין בו תיאורים גרפיים. אפשר להמשיך כרגיל, או לבחור בהגדרות ״עוצמת תוכן: עדינה״.
- `ch01.speaker.narrator`
  - before: מספר
  - after: קריין
- `ch01.speaker.radio`
  - before: קריין ברדיו (הצגה מחדש)
  - after: קריין ברדיו (שחזור)
- `ch01.speaker.khalidi`
  - before: וליד ח׳ליד׳י, היסטוריון פלסטיני (פרפרזה)
  - after: וליד ח׳אלדי, היסטוריון פלסטיני (פרפרזה)
- `ch01.mission.tower.goal2`
  - before: להכיר את הרקע: המרד הערבי (המרד הפלסטיני הגדול) של 1936–1939.
  - after: להכיר את הרקע: המרד הערבי הגדול (״המאורעות״ בעברית, ״המרד הפלסטיני הגדול״ אצל הפלסטינים), 1936–1939.
- `ch01.mission.landing.goal1`
  - before: להבין מה היתה עלייה ב׳ ולמה רוב הספינות נעצרו.
  - after: להבין מה הייתה עלייה ב׳, ולמה רוב הספינות נעצרו.
- `ch01.mission.vote.goal2`
  - before: להכיר את תגובת היישוב, ההנהגה והאוכלוסייה הפלסטינית ומדינות ערב, כל אחת במונחים שלה.
  - after: להכיר את תגובות היישוב, ההנהגה והאוכלוסייה הפלסטינית ומדינות ערב, כל אחת במונחים שלה.
- `ch01.tower.b1`
  - before: אנחנו ב־1937. המרד הערבי כבר בשנה שנייה, והדרכים אינן בטוחות.
  - after: אנחנו ב־1937. המרד הערבי כבר בשנתו השנייה, והדרכים אינן בטוחות.
- `ch01.tower.b2`
  - before: בעברית אומרים ״חומה ומגדל״. במחקר הפלסטיני אומרים ״המרד הפלסטיני הגדול״. שני שמות, אותה שנה.
  - after: בעברית קראו לשנים האלה ״המאורעות״ או ״המרד הערבי״. הפלסטינים קוראים להן ״המרד הפלסטיני הגדול״. שני שמות, אותן שנים.
- `ch01.tower.b4`
  - before: ובזמן שאתם בונים, אני אשאל: של מי היתה האדמה לפני כן, ומי עבד אותה?
  - after: ובזמן שאתם בונים, אני אשאל: של מי הייתה האדמה לפני כן, ומי עיבד אותה?
- `ch01.tower.d2`
  - before: הצד הציוני מדגיש שהקרקע נרכשה כדין. הצד הפלסטיני מדגיש שהחוכרים שעבדו אותה לא נשאלו.
  - after: הצד הציוני מדגיש שהקרקע נרכשה כדין. הצד הפלסטיני מדגיש שאת החוכרים שעיבדו אותה לא שאלו.
- `ch01.tower.d3`
  - before: ושני הצדדים מסכימים על דבר אחד: חלק גדול מהקרקע נמכר על ידי בעלים נעדרים, ולא על ידי מי שעבד אותה.
  - after: ושני הצדדים מצטטים את אותן טבלאות: חלק גדול מהקרקע מכרו בעלים גדולים, ובהם בעלים נעדרים, ולא מי שעיבד אותה.
- `ch01.tower.d4`
  - before: מה היה כאן קודם, ומה קרה לאנשים שעבדו כאן? בסיפורי ההתיישבות עצמם אין תשובה. הרשומות כאן שותקות.
  - after: מה היה כאן קודם, ומה קרה לאנשים שעבדו כאן? בסיפורי ההתיישבות עצמם אין תשובה, והרשומות שבידינו שותקות.
- `ch01.tower.f3`
  - before: סדר השלבים המדויק במשחק הוא הצגה מחדש. המקורות מתארים רק עץ מוכן מראש, קיר כפול מלא בחצץ ומגדל.
  - after: סדר השלבים המדויק במשחק הוא שחזור. המקורות מתארים רק עץ מוכן מראש, קיר כפול מלא בחצץ ומגדל.
- `ch01.landing.b2`
  - before: הבריטים החזיקו במדיניות הספר הלבן של 1939: 75,000 עולים בחמש שנים, ועוד 25,000 פליטים. אחר כך, בכפוף להסכמה ערבית (לפי ח׳ליד׳י).
  - after: הבריטים פעלו לפי הספר הלבן של 1939: 75,000 עולים בחמש שנים, ובהם 25,000 פליטים. אחרי זה, עלייה רק בהסכמה ערבית.
- `ch01.landing.f3`
  - before: בפועל, גם ספינת אקסודוס 1947, עם כ־4,500 פליטים, נעצרה ולא הגיעה לחוף.
  - after: בפועל, גם ״אקסודוס 1947״, ועליה כ־4,500 פליטים, נעצרה בידי הבריטים. שלושה מנוסעיה נהרגו.
- `ch01.vote.b2`
  - before: ההצעה: חלוקה לשתי מדינות, יהודית וערבית, ומשטר בינלאומי מיוחד בירושלים. זו המלצה, לא פקודה.
  - after: ההצעה: חלוקה לשתי מדינות, יהודית וערבית, ומשטר בינלאומי מיוחד בירושלים. זו המלצה, לא החלטה מחייבת.
- `ch01.vote.d2`
  - before: לפי ח׳ליד׳י, הפלסטינים ומדינות ערב היו נדהמים, ואילו הציונים צהלו.
  - after: לפי וליד ח׳אלדי, הפלסטינים ושאר הערבים היו המומים, ואילו הציונים צהלו.
- `ch01.vote.f1`
  - before: בפועל, בוועדה המיוחדת של האו״ם הוצעה פנייה לבית הדין הבין־לאומי, וההצעה נדחתה ב־21 מול 20 (לפי ח׳ליד׳י).
  - after: בפועל, בוועדה המיוחדת של האו״ם (אד־הוק) הוצע לפנות לבית הדין הבין־לאומי, וההצעה נדחתה ברוב של 21 מול 20 (לפי ח׳אלדי).
- `ch01.vote.f3`
  - before: בפועל, ירושלים הוגדרה בהחלטה כ״קורפוס ספרטום״ תחת משטר בינלאומי מיוחד בניהול האו״ם.
  - after: בפועל, ההחלטה הגדירה את ירושלים כ״גוף נפרד״ (קורפוס ספרטום) תחת משטר בינלאומי מיוחד בניהול האו״ם.
- `ch01.vote.s.yishuv`
  - before: היישוב: שמחה גדולה אחרי ההצבעה (לפי ח׳ליד׳י, הציונים צהלו).
  - after: היישוב: שמחה גדולה אחרי ההצבעה (לפי ח׳אלדי, הציונים צהלו).
- `ch01.vote.s.palestinians`
  - before: הפלסטינים: נדהמו. ההחלטה נראתה להם כתוכנית ציונית בצורתה, ופגיעה בזכות להגדרה עצמית.
  - after: הפלסטינים: היו המומים. בעיניהם, התוכנית הייתה ציונית במקורה ופגעה בזכותם להגדרה עצמית.
- `ch01.vote.s.arabstates`
  - before: מדינות ערב: ביקשו לשאול את בית הדין הבין־לאומי אם לעצרת יש סמכות לכפות חלוקה, וההצעה נדחתה.
  - after: מדינות ערב: ביקשו לשאול את בית הדין הבין־לאומי אם לעצרת יש סמכות לכפות חלוקה. ההצעה נדחתה.
- `ch01.vote.map1`
  - before: לפי ח׳ליד׳י: המדינה היהודית המוצעת, כ־5,500 מייל רבוע. המדינה הערבית המוצעת, כ־4,500.
  - after: לפי ח׳אלדי: המדינה היהודית המוצעת, כ־5,500 מיילים רבועים (כ־14,200 קמ״ר); המדינה הערבית המוצעת, כ־4,500 (כ־11,650 קמ״ר).
- `ch01.vote.map2`
  - before: לפי ח׳ליד׳י: היהודים היו לא יותר מ־35 אחוז מהאוכלוסייה והחזיקו בפחות מ־7 אחוז מהקרקע.
  - after: לפי ח׳אלדי: היהודים היו לא יותר מ־35 אחוזים מהאוכלוסייה, והחזיקו בפחות מ־7 אחוזים מהקרקע.
- `ch01.vote.map3`
  - before: ירושלים: קורפוס ספרטום תחת משטר בינלאומי מיוחד.
  - after: ירושלים: ״גוף נפרד״ (קורפוס ספרטום) תחת משטר בינלאומי מיוחד.
- `ch01.lens.1929.topic`
  - before: 1929: הכותל, חברון וצפת
  - after: 1929: הכותל (אל־בוראק), חברון וצפת
- `ch01.lens.1929.facts`
  - before: ב־15 באוגוסט 1929 נערכה הפגנה יהודית בכותל המערבי, ויום אחר כך הפגנת נגד ערבית. ב־23 באוגוסט החלה אלימות בירושלים, והיא התפשטה לחברון ולצפת. לפי הוועדה האנגלו־אמריקנית (1946): 133 יהודים נהרגו ו־339 נפצעו, ו־116 ערבים נהרגו, רבים מהם בידי המשטרה והצבא. בחברון נהרגו בין כ־60 ל־70 יהודים, לפי מקורות שונים.
  - after: ב־15 באוגוסט 1929 נערכה הפגנה יהודית בכותל המערבי, ולמחרת הפגנת נגד ערבית. ב־23 באוגוסט פרצה אלימות בירושלים, והיא התפשטה לחברון ולצפת. לפי הוועדה האנגלו־אמריקנית (1946): 133 יהודים נהרגו ו־339 נפצעו, ו־116 ערבים נהרגו, רבים מהם בידי המשטרה והצבא. בחברון נהרגו יותר מ־60 יהודים לפי הוועדה, ו־67 לפי הספרייה היהודית הווירטואלית.
- `ch01.lens.1929.zionist`
  - before: ויכוח על תפילה בכותל הפך לאלימות רחבה. בחברון נפגעה קהילה יהודית עתיקה, שרובה לא היתה ציונית, והיא לא שבה.
  - after: בזיכרון היהודי אלה ״פרעות תרפ״ט״: המון ערבי תקף יהודים, גם בקהילות ותיקות שלא היו ציוניות. בחברון נטבחה קהילה יהודית עתיקה, ששורשיה בעיר בני מאות שנים, והיא לא שבה לעיר.
- `ch01.lens.1929.palestinian`
  - before: החשש ששינויים בכותל (אל־בוראק) ובהר הבית ייעשו בכוח, יחד עם שמועות ופחד כלכלי, הוביל לאלימות. לפי ח׳ליד׳י, רוב ההרוגים הפלסטינים נהרגו בידי הבריטים.
  - after: לפי וליד ח׳אלדי, הפגנה של ציונים רוויזיוניסטים בכותל (אל־בוראק) נתפסה כעדות לכוונות ציוניות כלפי המסגדים בחרם א־שריף. לכך הצטרפו פחד מאובדן האדמה והפרנסה. רוב ההרוגים הפלסטינים נהרגו בידי הבריטים.
- `ch01.lens.1929.shared`
  - before: יהודים וערבים נהרגו. לפי מקור אחד, 22 משפחות ערביות בחברון הסתירו שכנים יהודים. ועדה בריטית ייחסה את האלימות לאכזבה פוליטית ולחשש כלכלי.
  - after: יהודים וערבים נהרגו. לפי הספרייה היהודית הווירטואלית, 22 משפחות ערביות בחברון הסתירו שכנים יהודים. ועדת שו הבריטית ייחסה את האלימות לאכזבה מהשאיפות הלאומיות ולחשש לעתיד הכלכלי.
- `ch01.lens.revolt.topic`
  - before: המרד הערבי 1936–1939
  - after: המרד הערבי הגדול, 1936–1939
- `ch01.lens.revolt.facts`
  - before: באפריל 1936 הוקמו ועדים לאומיים ערביים, והמופתי חאג׳ אמין אל־חוסייני היה חבר הוועד הערבי העליון. שביתה כללית החלה ב־22 באפריל 1936 והופסקה ב־11 באוקטובר 1936. אחר כך נמשך המרד עד 1939. הוועדה האנגלו־אמריקנית (1946) מדווחת על 1,791 הרוגים מאומתים ו־3,288 פצועים בשנים 1936–1939, ועוד כ־2,000 מורדים ערבים שנהרגו לפי הערכה. ח׳ליד׳י מדווח על כ־4,000 הרוגים פלסטינים בשנים 1937–1939.
  - after: באפריל 1936 קמו ועדים לאומיים ערביים, וב־25 באפריל הוקם הוועד הערבי העליון בראשות המופתי חאג׳ אמין אל־חוסייני. השביתה הכללית החלה ב־22 באפריל 1936 והסתיימה ב־11 באוקטובר 1936, ואחריה נמשך המרד עד 1939. הוועדה האנגלו־אמריקנית (1946) מדווחת על 1,791 הרוגים מאומתים ו־3,288 פצועים בשנים 1936–1939, ועוד כ־2,000 מורדים ערבים שנהרגו לפי הערכה. וליד ח׳אלדי מדווח על כ־4,000 הרוגים פלסטינים בשנים 1937–1939.
- `ch01.lens.revolt.zionist`
  - before: מרד אלים פגע ביהודים ובבריטים, ערער את הביטחון ודחף להגנה עצמית ולהגבלות בריטיות.
  - after: בעברית אלה ״המאורעות״: גל התקפות על יהודים, על יישובים ועל דרכים, שערער את הביטחון. היישוב הגיב בהגנה עצמית מאורגנת ובהקמת יישובים חדשים, והבריטים הטילו הגבלות.
- `ch01.lens.revolt.palestinian`
  - before: מרד עממי נגד שלטון בריטי, הגירה המונית ואובדן קרקע, שבסיסו האיכרים. הבריטים הגיבו במעצרים המוניים, הריסות וענישה קולקטיבית.
  - after: ״המרד הפלסטיני הגדול״: מרד עממי, שבסיסו האיכרים, נגד השלטון הבריטי, ההגירה ההמונית ואובדן הקרקע. הבריטים הגיבו במעצרים המוניים, בהריסות בתים ובענישה קולקטיבית.
- `ch01.lens.revolt.shared`
  - before: אלפי פלסטינים וכמה מאות יהודים ואנשי כוחות בריטיים נהרגו. ההנהגה הפלסטינית הוגלתה ונחלשה. המספרים שונים בין מקורות, ולכן מוצגים כטווח.
  - after: אלפי פלסטינים, ומאות יהודים ואנשי כוחות בריטיים, נהרגו. ההנהגה הפלסטינית הוגלתה ונחלשה. המספרים שונים בין המקורות, ולכן הם מוצגים כטווח.
- `ch01.lens.land.facts`
  - before: התיישבויות חומה ומגדל הוקמו על קרקע שנרכשה, בין היתר מבעלים נעדרים. אותן טבלאות רכישה משמשות חוקרים משני הצדדים. מקורות מתארים שההקמה נמשכה בתוך יום.
  - after: יישובי חומה ומגדל הוקמו על קרקע שנרכשה, בין היתר מבעלים נעדרים. חוקרים משני הצדדים משתמשים באותן טבלאות רכישה. לפי המקורות, כל יישוב הוקם בתוך יום.
- `ch01.lens.land.palestinian`
  - before: הקרקע נמכרה בידי בעלים נעדרים מעל ראשי החוכרים שעבדו אותה דורות. כל התיישבות היתה צעד נוסף להפיכת קרקע שנרכשה לקרקע יהודית בלבד, וליצירת עובדות לפני חלוקה.
  - after: הקרקע נמכרה בידי בעלים נעדרים, מעל ראשי החוכרים שעיבדו אותה דורות. כל יישוב היה עוד צעד בהפיכת קרקע שנרכשה לקרקע יהודית בלבד, וביצירת עובדות בשטח לפני חלוקה.
- `ch01.lens.land.shared`
  - before: בעלי קרקע גדולים, חלקם מבירות, מכרו חלק ניכר מהשטח. החוכרים לא היו המוכרים. בשלב מאוחר יותר הגבילו הבריטים רכישות בחלק מהאזורים.
  - after: בעלי קרקע גדולים, חלקם מביירות, מכרו חלק ניכר מהשטח. החוכרים לא היו המוכרים. בהמשך הגבילו הבריטים רכישות בחלק מהאזורים.
- `ch01.lens.immigration.facts`
  - before: ב־17 במאי 1939 פרסמה ממשלת בריטניה את הספר הלבן: 75,000 עולים בחמש שנים (מכסה של 10,000 בשנה), ועוד 25,000 פליטים, סמכויות להגבלת העברת קרקע, ומדינה עצמאית בתוך עשר שנים. אחרי המלחמה הגיעו ספינות מעפילים, ורבות נעצרו.
  - after: ב־17 במאי 1939 פרסמה ממשלת בריטניה את הספר הלבן: 75,000 עולים בחמש שנים (מכסה של 10,000 בשנה, ועוד 25,000 פליטים), סמכויות להגבלת העברת קרקע, ומדינה עצמאית בתוך עשר שנים. אחרי המלחמה הגיעו ספינות מעפילים, ורובן נעצרו.
- `ch01.lens.immigration.palestinian`
  - before: הקונגרסים הלאומיים הפלסטיניים דרשו להפסיק את ההגירה הציונית ולהקים ממשל מייצג. לפי ח׳ליד׳י, פלסטינים רבים התרשמו לטובה מהספר הלבן, אך התקשו לקבל את ההתניות.
  - after: הקונגרסים הלאומיים הפלסטיניים דרשו להפסיק את ההגירה הציונית ולהקים ממשל מייצג. לפי וליד ח׳אלדי, פלסטינים רבים התרשמו לטובה מהספר הלבן, אבל לא יכלו לקבל את ההתניות שבו.
- `ch01.lens.partition.facts`
  - before: ביולי 1937 הציעה ועדת פיל חלוקה. לפי הוועדה, כ־225,000 ערבים חיו באזור המוצע למדינה היהודית וכ־1,250 יהודים באזור המוצע למדינה הערבית. ב־29 בנובמבר 1947 אימצה העצרת הכללית את החלטה 181: 33 בעד, 13 נגד, 10 נמנעו.
  - after: ביולי 1937 הציעה ועדת פיל חלוקה. לפי הוועדה, כ־225,000 ערבים חיו באזור המוצע למדינה היהודית, וכ־1,250 יהודים באזור המוצע למדינה הערבית. ב־29 בנובמבר 1947 אימצה העצרת הכללית של האו״ם את החלטה 181: 33 בעד, 13 נגד, 10 נמנעים.
- `ch01.lens.partition.zionist`
  - before: החלוקה היתה פשרה: מדינה קטנה ליהודים, והבריטים הודו שהמנדט אינו יכול להמשיך. ההנהגה הציונית קיבלה את העיקרון, עם הסתייגויות.
  - after: החלוקה הייתה פשרה: מדינה קטנה ליהודים, והכרה בריטית בכך שהמנדט אינו יכול להימשך. ההנהגה הציונית קיבלה את העיקרון, בהסתייגויות.
- `ch01.lens.partition.palestinian`
  - before: החלוקה העניקה יותר ממחצית הקרקע לקהילה שהיתה מיעוט והחזיקה בפחות מ־7 אחוז ממנה. לפי ח׳ליד׳י, ההנהגה הערבית טענה שהיא פוגעת בהגדרה עצמית וביקשה חוות דעת של בית הדין הבין־לאומי.
  - after: לפי וליד ח׳אלדי, החלטה 181 נתנה למדינה היהודית יותר ממחצית השטח, אף שהיהודים היו לכל היותר 35 אחוזים מהאוכלוסייה והחזיקו בפחות מ־7 אחוזים מהקרקע. ההנהגה הערבית טענה שהחלוקה פוגעת בזכות להגדרה עצמית, וביקשה חוות דעת של בית הדין הבין־לאומי.
- `ch01.lens.partition.shared`
  - before: ההחלטה היתה המלצה. במדינה היהודית המוצעת היה מיעוט ערבי גדול, ובמדינה הערבית כמעט שלא היו יהודים.
  - after: ההחלטה הייתה המלצה. במדינה היהודית המוצעת היה מיעוט ערבי גדול, ובמדינה הערבית כמעט לא היו יהודים.
- `ch01.codex.hashomer.body`
  - before: ארגון שנוסד באפריל 1909. מטרתו היתה הזכות לעבוד ולשמור במושבות. הוא שימש מקור להגנה עצמית יהודית מאורגנת.
  - after: ארגון שנוסד באפריל 1909, ומטרתו הייתה הזכות לעבוד ולשמור במושבות במקום שומרים לא־יהודים. ב־1914 מנה כ־40 חברים.
- `ch01.codex.degania.body`
  - before: אחת ההתיישבויות הקבוציות הראשונות. התאריך שנוי במחלוקת: 1909 או 1910. מקורות מכנים אותה קבוצה, ולא קיבוץ.
  - after: אחת ההתיישבויות השיתופיות הראשונות. שנת הייסוד שנויה במחלוקת: 1909 או 1910. המקורות מכנים אותה ״קבוצה״, ולא קיבוץ, ו״אם הקבוצות״.
- `ch01.codex.balfour.body`
  - before: שר החוץ הבריטי שחתם ב־2 בנובמבר 1917 על מכתב ללורד רוטשילד. המכתב הבטיח תמיכה בבית לאומי לעם היהודי בפלסטין.
  - after: שר החוץ הבריטי. ב־2 בנובמבר 1917 חתם על מכתב ללורד רוטשילד, שבו הביעה ממשלת בריטניה תמיכה בהקמת בית לאומי לעם היהודי בפלשתינה (ארץ ישראל).
- `ch01.codex.mandate.title`
  - before: המנדט על פלשתינה
  - after: המנדט הבריטי על פלשתינה (ארץ ישראל)
- `ch01.codex.mandate.body`
  - before: מסמך שנחתם בלונדון ב־24 ביולי 1922. הוא מזכיר בפתיחתו את הצהרת בלפור. נכנס לתוקף בספטמבר 1923.
  - after: כתב המנדט אושר בלונדון ב־24 ביולי 1922, ונכנס לתוקף בספטמבר 1923. בפתיחתו מוזכרת הצהרת בלפור.
- `ch01.codex.riots-1920-1921.body`
  - before: באפריל 1920 היו שלושה ימי אלימות בירושלים: 5 יהודים ו־4 ערבים נהרגו. במאי 1921 הותקפו תושבים יהודים ביפו; הוועדה הבריטית רשמה 95 הרוגים, 48 ערבים ו־47 יהודים. לפי ח׳ליד׳י, הרקע היה פחד מציונות והעדר ממשל מייצג.
  - after: באפריל 1920 היו שלושה ימי אלימות בירושלים: 5 יהודים ו־4 ערבים נהרגו. במאי 1921 הותקפו תושבים יהודים ביפו; ועדת החקירה הבריטית רשמה 95 הרוגים, 47 יהודים ו־48 ערבים, רבים מהערבים בפעולות המשטרה והצבא. לפי וליד ח׳אלדי, הרקע היה פחד מהציונות והיעדר ממשל מייצג.
- `ch01.codex.tel-hai.body`
  - before: ב־1 במרץ 1920 נפלו בתל חי כמה מאנשי היישוב, ובהם יוסף טרומפלדור. שישה מתו במרץ ושניים נוספים בינואר.
  - after: בקרב ב־1 במרץ 1920 נפלו שישה ממגיני תל חי, ובהם יוסף טרומפלדור. שניים נוספים נהרגו שם כבר בינואר אותה שנה.
- `ch01.codex.hebron-safed-1929.body`
  - before: ב־24 באוגוסט 1929 נהרגו בחברון בין כ־60 ל־70 יהודים. בצפת נהרגו או נפצעו 45. לפי מקור אחד, 22 משפחות ערביות הסתירו שכנים יהודים. הקהילה היהודית בחברון לא שבה.
  - after: ב־24 באוגוסט 1929 נהרגו בחברון יותר מ־60 יהודים (67 לפי הספרייה היהודית הווירטואלית). בצפת נהרגו או נפצעו 45. לפי אותו מאגר, 22 משפחות ערביות בחברון הסתירו שכנים יהודים. הקהילה היהודית בחברון לא שבה.
- `ch01.codex.haj-amin.body`
  - before: מופתי ירושלים, וחבר הוועד הערבי העליון שהוקם ב־25 באפריל 1936.
  - after: מופתי ירושלים. עמד בראש הוועד הערבי העליון, שהוקם ב־25 באפריל 1936.
- `ch01.codex.arab-higher-committee.body`
  - before: גוף שהוקם ב־25 באפריל 1936, בראשותו של חאג׳ אמין אל־חוסייני. הוא ריכז את הנהגת השביתה, ודרש להפסיק את ההגירה ואת מכירת הקרקעות ולהקים ממשל עצמי.
  - after: גוף שהוקם ב־25 באפריל 1936 בראשות חאג׳ אמין אל־חוסייני. הוא הנהיג את השביתה, ודרש להפסיק את ההגירה היהודית ואת מכירת הקרקעות ולהקים ממשל עצמי.
- `ch01.codex.arab-revolt.body`
  - before: שביתה כללית שהחלה באפריל 1936, ואחריה מרד. פלסטינים מכנים אותו ״המרד הפלסטיני הגדול״. המספרים משתנים בין מקורות; אנחנו מציגים אותם כטווח.
  - after: שביתה כללית שהחלה באפריל 1936, ואחריה מרד שנמשך עד 1939. בעברית נקראו השנים האלה ״המאורעות״; הפלסטינים מכנים אותן ״המרד הפלסטיני הגדול״. המספרים שונים בין המקורות, ולכן הם מוצגים כטווח.
- `ch01.codex.tower-and-stockade.body`
  - before: שיטת התיישבות של 1936–1939. עץ מוכן מראש, קיר עץ כפול מלא בחצץ, ומגדל. מונים כ־57 התיישבויות, ויש מקורות שמונים 55.
  - after: שיטת התיישבות בשנים 1936–1939: עץ מוכן מראש, קיר עץ כפול שמולא בחצץ, ומגדל. רוב המקורות מונים 57 יישובים כאלה, ויש שמונים 55.
- `ch01.codex.tel-amal.body`
  - before: ב־10 בדצמבר 1936 הוקמה תל עמל, שמתוארת כהתיישבות חומה ומגדל הראשונה.
  - after: ב־10 בדצמבר 1936 הוקמה תל עמל, שמתוארת כיישוב חומה ומגדל הראשון.
- `ch01.codex.peel-commission.body`
  - before: בדו״ח של יולי 1937 הוצעה חלוקה לשתי מדינות. לפי הוועדה, כ־225,000 ערבים חיו באזור המוצע למדינה יהודית, ורק כ־1,250 יהודים באזור המוצע למדינה ערבית. לפי ח׳ליד׳י, הערבים דחו את התוכנית, וב־1938 הוקמה ועדה שמצאה אותה בלתי מעשית.
  - after: בדוח של יולי 1937 הציעה הוועדה לחלק את הארץ לשתי מדינות. לפי הוועדה, כ־225,000 ערבים חיו באזור המוצע למדינה היהודית, ורק כ־1,250 יהודים באזור המוצע למדינה הערבית. לפי וליד ח׳אלדי, הערבים דחו את התוכנית, וב־1938 קבעה ועדת וודהד שהיא אינה מעשית.
- `ch01.codex.white-paper.body`
  - before: פורסם ב־17 במאי 1939. הגביל את העלייה ל־75,000 בחמש שנים, ועוד 25,000 פליטים, והבטיח מדינה עצמאית בתוך עשר שנים. אף צד לא קיבל אותו במלואו.
  - after: פורסם ב־17 במאי 1939. הגביל את העלייה ל־75,000 איש בחמש שנים, ובהם 25,000 פליטים, וקבע שתוך עשר שנים תקום מדינה עצמאית. אף צד לא קיבל אותו במלואו.
- `ch01.codex.anglo-american-committee.body`
  - before: ועדת חקירה משותפת שישבה בינואר–אפריל 1946. הדו״ח שלה הוא אחד ממקורות המספרים שלנו על האלימות בשנים 1920–1939.
  - after: ועדת חקירה משותפת לארצות הברית ולבריטניה, שישבה בינואר–אפריל 1946. הדוח שלה הוא אחד ממקורות המספרים שלנו על האלימות בשנים 1920–1939.
- `ch01.codex.irgun.body`
  - before: ארגון מחתרתי יהודי. אנשיו ביצעו את הפיצוץ במלון המלך דוד ב־22 ביולי 1946. ההגנה גינתה את הפיצוץ בפומבי.
  - after: ארגון מחתרת יהודי. אנשיו פוצצו את מלון המלך דוד ב־22 ביולי 1946. לפי החוקר ברוס הופמן, ההגנה אישרה את הפעולה מראש, אך גינתה אותה בפומבי אחריה.
- `ch01.codex.begin.body`
  - before: מנהיג האצ״ל. לפי עדויות האצ״ל, ניתנה אזהרה של 22–30 דקות לפני הפיצוץ.
  - after: מנהיג האצ״ל. לפי גרסת האצ״ל, ניתנה אזהרה 22–30 דקות לפני הפיצוץ במלון המלך דוד. החוקר ברוס הופמן מצא שהשיחה הראשונה נעשתה כעשר דקות לפני הפיצוץ.
- `ch01.codex.king-david-hotel.body`
  - before: ב־22 ביולי 1946 נהרגו 91 בני אדם: 41 ערבים, 28 בריטים, 17 יהודים ועוד כמה אחרים. מספר הפצועים שנוי במחלוקת: כ־70 או 45, לפי מקור.
  - after: ב־22 ביולי 1946 נהרגו בפיצוץ 91 בני אדם: 41 ערבים, 28 בריטים, 17 יהודים ועוד חמישה אחרים. מספר הפצועים שנוי במחלוקת: כ־70 לפי הופמן, 45 לפי הספרייה היהודית הווירטואלית.
- `ch01.codex.aliyah-bet.body`
  - before: עלייה בלתי חוקית בים. לפי ההערכה, למעלה מ־100,000 איש עד 1948, ובהם יותר מ־70,000 ניצולים. מעל 90 אחוז מהספינות אחרי המלחמה נעצרו, ויותר מ־50,000 הוחזקו בקפריסין.
  - after: עלייה בלתי חוקית בים. לפי מוזיאון השואה של ארצות הברית, עד 1948 הגיעו כך הרבה יותר מ־100,000 איש, ובהם יותר מ־70,000 ניצולי שואה. יותר מ־90 אחוזים מהספינות שהפליגו אחרי המלחמה נעצרו, ויותר מ־50,000 איש הוחזקו במחנות בקפריסין.
- `ch01.codex.exodus-1947.body`
  - before: ספינה עם כ־4,500 פליטים, שנעצרה בידי הבריטים ב־1947.
  - after: ספינה ועליה כ־4,500 פליטים, שבריטניה עצרה ב־1947. שלושה מנוסעיה נהרגו.
- `ch01.codex.res-181.body`
  - before: ב־29 בנובמבר 1947 אימצה העצרת הכללית של האו״ם תוכנית חלוקה: 33 בעד, 13 נגד, 10 נמנעו, ובהם בריטניה. ירושלים הוגדרה כקורפוס ספרטום. המנדט ייגמר לכל המאוחר ב־1 באוגוסט 1948.
  - after: ב־29 בנובמבר 1947 אימצה העצרת הכללית של האו״ם תוכנית חלוקה: 33 בעד, 13 נגד, 10 נמנעים, ובהם בריטניה. ירושלים הוגדרה ״גוף נפרד״ (קורפוס ספרטום). המנדט אמור היה להסתיים לכל המאוחר ב־1 באוגוסט 1948.
- `ch01.codex.five-documents.body`
  - before: מכתב בלפור (1917), המנדט (1922), דו״ח פיל (1937), הספר הלבן (1939) והחלטה 181 (1947). כל אחד שינה את מה שאפשר היה לצפות.
  - after: מכתב בלפור (1917), כתב המנדט (1922), דוח פיל (1937), הספר הלבן (1939) והחלטה 181 (1947). כל אחד מהם שינה את התמונה המדינית בארץ.
- `ch01.archive.balfour.desc`
  - before: ממשלת הוד מלכותו רואה בעין יפה הקמת בית לאומי לעם היהודי בפלסטין, ותעשה כמיטב יכולתה להקל על השגת המטרה. מובן שלא ייעשה דבר שיפגע בזכויות האזרחיות והדתיות של הקהילות הלא־יהודיות הקיימות בפלסטין. תרגום חופשי; הביטוי במקור: ״a national home for the Jewish people״.
  - after: ״ממשלת הוד מלכותו רואה בעין יפה הקמת בית לאומי לעם היהודי בפלשתינה, ותעשה כמיטב יכולתה להקל על השגת מטרה זו. ובלבד שיהיה ברור שלא ייעשה דבר העלול לפגוע בזכויות האזרחיות והדתיות של הקהילות הלא־יהודיות הקיימות בפלשתינה, או בזכויות ובמעמד המדיני של יהודים בכל ארץ אחרת.״ תרגום שלנו; במקור: ״⁨a national home for the Jewish people⁩״.
- `ch01.archive.balfour.prov`
  - before: מכתב מ־2 בנובמבר 1917. שחזור מוקלד של טקסט נחלת הכלל. מקור: אתר אבלון, אוניברסיטת ייל.
  - after: מכתב מ־2 בנובמבר 1917. שחזור מוקלד של טקסט שהוא נחלת הכלל, בתרגום שלנו. מקור: פרויקט אבלון, אוניברסיטת ייל.
- `ch01.archive.mandate.desc`
  - before: המנדט נחתם בלונדון ב־24 ביולי 1922. בפתיחתו מוזכרת הצהרת בלפור. תקציר בלבד, בלשוננו.
  - after: כתב המנדט אושר בלונדון ב־24 ביולי 1922. בפתיחתו מוזכרת הצהרת בלפור. תקציר בלבד, בלשוננו.
- `ch01.archive.mandate.prov`
  - before: מסמך מ־1922. נחלת הכלל. שחזור מוקלד של תקציר; מקור: אבלון.
  - after: מסמך מ־1922, נחלת הכלל. תקציר מוקלד בלשוננו. מקור: פרויקט אבלון.
- `ch01.archive.white-paper.desc`
  - before: פורסם ב־17 במאי 1939. 75,000 עולים בחמש שנים, מכסה של 10,000 בשנה, ועוד 25,000 פליטים. סמכויות להגבלת העברת קרקע. מדינה עצמאית בתוך עשר שנים. תקציר בלשוננו.
  - after: פורסם ב־17 במאי 1939: 75,000 עולים בחמש שנים (10,000 בשנה, ועוד 25,000 פליטים); סמכויות להגבלת העברת קרקע; מדינה עצמאית בתוך עשר שנים. תקציר בלשוננו.
- `ch01.archive.white-paper.prov`
  - before: מסמך ממשלתי בריטי מ־1939. נחלת הכלל. שחזור מוקלד של תקציר; מקורות: אבלון וויקיטקסט.
  - after: מסמך ממשלתי בריטי מ־1939, נחלת הכלל. תקציר מוקלד בלשוננו. מקורות: פרויקט אבלון וויקיטקסט.
- `ch01.archive.peel.title`
  - before: דו״ח ועדת פיל (קטעים מוקלדים)
  - after: דוח ועדת פיל (קטעים מוקלדים)
- `ch01.archive.peel.desc`
  - before: דו״ח של יולי 1937, פרק ״תוכנית חלוקה״. כ־225,000 ערבים באזור המוצע למדינה יהודית; כ־1,250 יהודים באזור המוצע למדינה ערבית; ירושלים וחיפה אזורים מעורבים. נוסח בלשוננו.
  - after: דוח מיולי 1937, הפרק ״תוכנית חלוקה״: כ־225,000 ערבים באזור המוצע למדינה היהודית; כ־1,250 יהודים באזור המוצע למדינה הערבית; ירושלים וחיפה אזורים מעורבים. בלשוננו.
- `ch01.archive.peel.prov`
  - before: דו״ח בריטי מ־1937, זכויות היוצרים פגו. שחזור מוקלד של קטעים קצרים. לא נעשה שימוש בסריקה.
  - after: דוח בריטי מ־1937; זכויות היוצרים פגו. שחזור מוקלד של קטעים קצרים. לא נעשה שימוש בסריקה.
- `ch01.archive.aacic.desc`
  - before: אפריל 1920: 5 יהודים ו־4 ערבים נהרגו, 211 יהודים ו־21 ערבים נפצעו. 1929: 133 יהודים ו־116 ערבים נהרגו. 1936–1939: 1,791 הרוגים מאומתים ועוד כ־2,000 מורדים ערבים, לפי הערכה. נוסח בלשוננו.
  - after: אפריל 1920: 5 יהודים ו־4 ערבים נהרגו, 211 יהודים ו־21 ערבים נפצעו. 1929: 133 יהודים ו־116 ערבים נהרגו. 1936–1939: 1,791 הרוגים מאומתים, ועוד כ־2,000 מורדים ערבים לפי הערכה. בלשוננו.
- `ch01.archive.aacic.prov`
  - before: דו״ח משותף, ארה״ב ובריטניה, מ־20 באפריל 1946. שחזור מוקלד של קטעים קצרים. מקור: אבלון.
  - after: דוח משותף לארצות הברית ולבריטניה, מ־20 באפריל 1946. שחזור מוקלד של קטעים קצרים. מקור: פרויקט אבלון.
- `ch01.archive.res181.desc`
  - before: ירושלים תהיה ״corpus separatum under a special international regime״, בניהול האו״ם. ההחלטה אומצה ב־29 בנובמבר 1947, 33 בעד, 13 נגד, 10 נמנעו. המנדט ייגמר לכל המאוחר ב־1 באוגוסט 1948; העצמאות לכל המאוחר ב־1 באוקטובר 1948.
  - after: ירושלים תהיה ״⁨corpus separatum under a special international regime⁩״ (״גוף נפרד תחת משטר בינלאומי מיוחד״), בניהול האו״ם. ההחלטה אומצה ב־29 בנובמבר 1947: 33 בעד, 13 נגד, 10 נמנעים. המנדט יסתיים לכל המאוחר ב־1 באוגוסט 1948, והמדינות יקומו לכל המאוחר ב־1 באוקטובר 1948.
- `ch01.archive.res181.prov`
  - before: מסמך או״ם. קטע קצר מצוטט עם ייחוס, ושאר הטקסט בתקציר שלנו. מקורות: אבלון ו־ibiblio.
  - after: מסמך או״ם. קטע קצר מצוטט עם ייחוס, ושאר הטקסט בתקציר שלנו. מקורות: פרויקט אבלון ו־⁨ibiblio⁩.
- `ch01.testimony.passenger.body`
  - before: דמות מורכבת, על בסיס תיאורי מוזיאון השואה האמריקני: אחרי המלחמה חיפשה בית. המסע היה ארוך, והיא לא ידעה אם תגיע.
  - after: דמות מורכבת, על בסיס תיאורי מוזיאון השואה של ארצות הברית: אחרי המלחמה חיפשה בית. המסע היה ארוך, והיא לא ידעה אם תגיע.
- `ch01.testimony.hebron.body`
  - before: לפי המאגר, בחברון ב־1929 22 משפחות ערביות הסתירו שכנים יהודים. היהודים שנותרו פונו לירושלים, ובחברון לא נשארה קהילה יהודית.
  - after: לפי המאגר, ב־1929 הסתירו 22 משפחות ערביות בחברון שכנים יהודים. היהודים שנותרו בעיר פונו לירושלים, ובחברון לא נשארה קהילה יהודית.
- `ch01.testimony.khalidi.speaker`
  - before: וליד ח׳ליד׳י, היסטוריון פלסטיני (פרפרזה)
  - after: וליד ח׳אלדי, היסטוריון פלסטיני (פרפרזה)
- `ch01.testimony.khalidi.body`
  - before: לפי ח׳ליד׳י, אחרי ההצבעה ב־29 בנובמבר 1947 הפלסטינים ושאר הערבים היו נדהמים, והציונים היו צוהלים.
  - after: לפי ח׳אלדי, אחרי ההצבעה ב־29 בנובמבר 1947 הפלסטינים ושאר הערבים היו המומים, והציונים צהלו.
- `ch01.testimony.hoffman.body`
  - before: לפי הופמן, ההגנה אישרה את הפעולה במלון המלך דוד אך גינתה אותה בשידור ב־23 ביולי 1946.
  - after: לפי הופמן, ההגנה אישרה מראש את הפעולה במלון המלך דוד, אך גינתה אותה בשידור ב־23 ביולי 1946.
- `ch01.fact.haganah`
  - before: לפי הופמן, ההגנה אישרה את הפיצוץ במלון המלך דוד, אך גינתה אותו בשידור ב־23 ביולי 1946.
  - after: לפי החוקר ברוס הופמן, ההגנה אישרה מראש את הפיצוץ במלון המלך דוד, אך גינתה אותו בשידור ב־23 ביולי 1946.
- `ch01.fact.victims`
  - before: בין 91 ההרוגים במלון המלך דוד היו 41 ערבים, 28 בריטים ו־17 יהודים; 16 מהם היו בכירים, ורבים יותר פקידים זוטרים.
  - after: בין 91 ההרוגים במלון המלך דוד היו 41 ערבים, 28 בריטים ו־17 יהודים. לפי הופמן, 16 מהם היו פקידים בכירים, ורבים יותר פקידים זוטרים.
- `ch01.fact.warning`
  - before: האצ״ל טוען שניתנה אזהרה של 22–30 דקות. לפי הופמן, השיחה הראשונה היתה בסביבות 12:27, עשר דקות לפני הפיצוץ ב־12:37. הבריטים אמרו שאזהרה לא הגיעה לאיש בשלטון.
  - after: לפי גרסת האצ״ל, ניתנה אזהרה 22–30 דקות מראש. לפי הופמן, השיחה הראשונה נעשתה בסביבות 12:27, עשר דקות לפני הפיצוץ ב־12:37. הבריטים טענו שאף אזהרה לא הגיעה לבעלי סמכות.
- `ch01.fact.intercepted`
  - before: מעל 90 אחוז מהספינות אחרי המלחמה נעצרו, ויותר מ־50,000 איש הוחזקו בקפריסין.
  - after: יותר מ־90 אחוזים מספינות המעפילים שהפליגו אחרי המלחמה נעצרו, ויותר מ־50,000 איש הוחזקו במחנות בקפריסין.
- `ch01.fact.hebron-families`
  - before: לפי מאגר אחד, 22 משפחות ערביות בחברון הסתירו שכנים יהודים ב־1929.
  - after: לפי הספרייה היהודית הווירטואלית, ב־1929 הסתירו 22 משפחות ערביות בחברון שכנים יהודים.
- `ch01.fact.uk-abstained`
  - before: בהחלטה 181 בריטניה נמנעה. המנדט הבריטי היה אמור להסתיים לכל המאוחר ב־1 באוגוסט 1948.
  - after: בריטניה נמנעה בהצבעה על החלטה 181. לפי ההחלטה, המנדט הבריטי היה אמור להסתיים לכל המאוחר ב־1 באוגוסט 1948.
- `ch01.quiz.strike.prompt`
  - before: באפריל 1936 ועד לאומי באיזו עיר החליט על שביתה כללית ערבית?
  - after: באפריל 1936 קרא ועד לאומי ערבי לשביתה כללית. באיזו עיר?
- `ch01.quiz.strike.exp`
  - before: ב־20 באפריל 1936 החליט הוועד הלאומי בשכם על שביתה כללית.
  - after: ב־20 באפריל 1936 החליט הוועד הלאומי הערבי בשכם על שביתה כללית.
- `ch01.quiz.white-paper.exp`
  - before: 75,000 בחמש שנים, ועוד 25,000 פליטים.
  - after: 75,000 בחמש שנים, ובהם 25,000 פליטים.
- `ch01.quiz.king-david.exp`
  - before: האצ״ל ביצע אותו. ההגנה גינתה אותו בפומבי.
  - after: האצ״ל ביצע את הפיצוץ. ההגנה, שלפי הופמן אישרה את הפעולה מראש, גינתה אותה בפומבי.
- `ch01.quiz.exodus.exp`
  - before: היו על הספינה כ־4,500 פליטים.
  - after: על הספינה היו כ־4,500 פליטים.
- `ch01.quiz.vote.exp`
  - before: 33 בעד, 13 נגד, 10 נמנעו, ובהם בריטניה.
  - after: 33 בעד, 13 נגד ו־10 נמנעים, ובהם בריטניה.
- `ch01.quiz.jerusalem.o3`
  - before: קורפוס ספרטום תחת משטר בינלאומי מיוחד
  - after: ״גוף נפרד״ (קורפוס ספרטום) תחת משטר בינלאומי מיוחד
- `ch01.quiz.jerusalem.exp`
  - before: ירושלים הוגדרה כקורפוס ספרטום בניהול האו״ם.
  - after: ירושלים הוגדרה ״גוף נפרד״ בניהול האו״ם.
- `ch01.quiz.mandate.prompt`
  - before: איזה מסמך מוזכר בפתיחת המנדט על פלשתינה (24 ביולי 1922)?
  - after: איזה מסמך מוזכר בפתיחת כתב המנדט על פלשתינה (24 ביולי 1922)?
- `ch01.quiz.peel.prompt`
  - before: מתי פורסם דו״ח ועדת פיל, שהציע חלוקה?
  - after: מתי פורסם דוח ועדת פיל, שהציע חלוקה?
- `ch01.cut.place1`
  - before: ארץ ישראל־פלסטין, 1937. בין ערביים
  - after: ארץ ישראל / פלשתינה, 1937. בין ערביים

### Global spelling passes on src/locales/he/ch01.json (after the log above)
- "היתה" -> "הייתה" in ch01.tower.f2, ch01.vote.h2, ch01.quiz.vote.prompt.
- "הדו״ח" -> "הדוח" in ch01.quiz.peel.exp.
- timeline.lens.nakba.body: "ח׳אלידי" -> "ח׳אלדי" (spelling only).
