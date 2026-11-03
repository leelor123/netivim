# ADR 0006: Graphics presets as data, applied live

Status: accepted (2026-11-03)

Decision: A GraphicsSettings object (resolution scale, fps cap, shadows, AA, AO, bloom, fog,
particles, vegetation, render distance, LOD distance, grading, DoF, motion blur) is produced by
a preset table or custom edits and applied by a RenderPipeline without recreating the renderer
where possible (MSAA changes recreate render targets only). WebGLRenderer, AgX tone mapping,
PCFShadowMap. EffectComposer is used only when a post effect is on. Adaptive quality watches a
rolling frame-time window and steps down one preset after sustained misses.

Consequences: settings changes are live and saved; low presets pay nothing for post effects.
