# ADR 0004: Content as typed TypeScript data plus runtime validators

Status: accepted (2026-11-03)

Decision: Chapters, missions, dialogue, cutscenes, quizzes, codex and archive items are TS
modules exporting data typed by interfaces in src/content/schema.ts. Hand-written validators
(no new dependency) check cross-references: source IDs exist in SOURCES, locale keys exist,
labels are set, quiz answers are valid. The validators run in unit tests (and therefore in CI,
before any build is released). Chapters are loaded with dynamic import() so each is its own chunk.

Consequences: type errors are caught by tsc; reference errors by tests; no JSON parsing at runtime.
