import type { ChapterId } from '../content/eras';
import type { FlowState } from '../core/flow';
import type { UnlockKind } from '../core/gameEvents';
import type { Game } from '../game';
import { TimelineScreen } from '../features/timeline/timelineScreen';
import { glyphFor } from '../ui/glyphs';
import { worldQualityFromSettings } from '../world/quality';
import { ChapterRun } from './core/chapterRun';
import { ledgerRows, recordChoice } from './core/ledger';
import { applyUnlock, atMissionStart, buildRecap, completeChapter, completeMission, nextMissionIndex, withMissionSnapshot } from './core/progress';
import { chapterForSlot, loadAllChapters, loadChapter, loadLevel } from './registry';
import { createArchiveViewer } from './runtime/archiveViewer';
import { MissionHost } from './runtime/missionHost';
import type { AnyLevelDefinition, ChapterDefinition } from './types';
import { archiveListScreen, codexScreen, provenanceScreen, type ArchiveEntry } from './ui/codex';
import { ScreenStack } from './ui/host';
import { MissionHud } from './ui/missionHud';
import { plannerScreen } from './ui/planner';
import {
  briefingScreen,
  contentNoteScreen,
  debriefScreen,
  decisionScreen,
  failureScreen,
  featureScreen,
  hubMenuScreen,
  quizScreen,
  recapScreen,
  type T,
} from './ui/screens';

interface CinematicsLike {
  play(id: string, after?: 'none' | 'resumeMission' | 'toDebrief'): boolean;
}

const UNLOCK_TOAST: Readonly<Record<UnlockKind, string>> = {
  codex: 'gameplay.toast.codex',
  archive: 'gameplay.toast.archive',
  testimony: 'gameplay.toast.testimony',
  achievement: 'gameplay.toast.achievement',
  medal: 'gameplay.toast.medal',
  fact: 'gameplay.toast.fact',
};

/**
 * Chapter flow director: hub menu -> chapter select (timeline) -> content note -> briefing ->
 * missions -> cutscene -> debrief -> quiz -> hub, plus codex, archive and "Previously on".
 * Owns the safe-moment autosaves (BRIEF 8.D) and the mission-start save (8.B).
 */
export class Director {
  readonly stack: ScreenStack;
  host: MissionHost | null = null;
  run: ChapterRun | null = null;
  private levelDef: AnyLevelDefinition | null = null;
  private hud: MissionHud | null = null;
  private cameFromTitle = true;
  private chapterEnd = false;
  private viewerOpen = false;
  private token = 0;
  private readonly offs: (() => void)[] = [];
  private readonly t: T;

  constructor(private readonly game: Game) {
    this.t = (k, p) => game.i18n.t(k, p);
    this.stack = new ScreenStack(game);
    this.offs.push(
      game.bus.on('flow:changed', ({ from, to }) => this.onFlow(from, to)),
      game.bus.on('flow:pause-changed', ({ paused }) => {
        // The exact state goes into the game state before any manual save can be taken (8.C).
        if (paused && this.host && this.run && game.flow.state === 'mission') {
          game.setState(withMissionSnapshot(game.getState(), this.run.chapter.content.id, this.host.snapshot()));
        }
        this.hud?.setVisible(!paused);
      }),
      game.bus.on('unlock:item', ({ kind, id }) => {
        game.setState(applyUnlock(game.getState(), kind, id));
        game.bus.emit('ui:toast', { textKey: UNLOCK_TOAST[kind] });
        if (!game.flow.isVolatile) game.save.autosave('unlock');
        else game.save.markDirty();
      }),
      game.bus.on('mission:checkpoint', () => game.save.markDirty()),
      game.onStep((dt) => {
        if (this.host && game.flow.state === 'mission') this.host.update(dt);
      }),
    );
  }

  dispose(): void {
    this.token++;
    for (const off of this.offs) off();
    this.cleanupMission();
    this.stack.dispose();
  }

  // ---- flow ---------------------------------------------------------------------------------

  private onFlow(from: FlowState, to: FlowState): void {
    switch (to) {
      case 'title':
        this.token++;
        this.stack.clear();
        this.cleanupMission();
        this.run = null;
        this.cameFromTitle = true;
        break;
      case 'hub': {
        if (from === 'mission' || from === 'cutscene') this.resetResumeToMissionStart();
        this.cleanupMission();
        this.game.save.autosave(from === 'quiz' ? 'chapter-complete' : 'hub');
        const showRecap = this.cameFromTitle && this.game.getState().resume.chapterId !== null;
        this.cameFromTitle = false;
        if (showRecap) this.showRecap();
        else this.showHubMenu();
        break;
      }
      case 'briefing':
        this.showBriefing();
        break;
      case 'mission':
        this.stack.clear();
        this.startMission();
        break;
      case 'cutscene':
        this.stack.clear();
        this.hud?.setVisible(false);
        break;
      case 'debrief':
        this.disposeHud();
        this.game.save.autosave('mission-complete');
        this.showDebrief();
        break;
      case 'quiz':
        this.showQuiz();
        break;
      default:
        break;
    }
  }

  /** Abandoning a mission must not autosave its mid-mission state (BRIEF 8.B). */
  private resetResumeToMissionStart(): void {
    const host = this.host;
    const run = this.run;
    if (!host || host.phase === 'complete' || !run) return;
    const def = host.def;
    this.game.setState(atMissionStart(this.game.getState(), run.chapter.content.id, def.missionId, def.mission.machine.initial));
  }

  // ---- hub ----------------------------------------------------------------------------------

  showHubMenu(): void {
    // Warm the chapter chunks while the player looks at the menu, so a chapter opens at once.
    loadAllChapters().catch(() => undefined);
    const s = this.game.getState();
    this.stack.reset(
      hubMenuScreen(this.t, {
        canContinue: s.resume.chapterId !== null,
        onChapters: () => this.openTimeline(),
        onContinue: () => {
          const id = this.game.getState().resume.chapterId;
          if (id) this.beginChapter(id, true);
        },
        onCodex: () => void this.openCodex(),
        onArchive: () => void this.openArchive(),
      }),
    );
  }

  private showRecap(): void {
    const id = this.game.getState().resume.chapterId;
    if (!id) {
      this.showHubMenu();
      return;
    }
    this.showHubMenu();
    const mine = this.token;
    loadChapter(id)
      .then((ch) => {
        if (mine !== this.token || this.game.flow.state !== 'hub') return;
        const recap = buildRecap(this.game.getState(), ch.content);
        this.stack.push(
          recapScreen(this.t, recap, () => this.beginChapter(id, true), () => this.stack.pop()),
        );
      })
      .catch((e: unknown) => console.error('[netivim] recap failed', e));
  }

  openTimeline(): void {
    const timeline = new TimelineScreen({
      t: this.game.i18n.t,
      rtl: this.game.i18n.dir === 'rtl',
      getCompletedChapters: () => this.game.getState().completedChapters,
      onSelect: (slot) => this.selectSlot(slot),
      onBack: () => this.stack.pop(),
      reducedMotion: () => this.game.settings.value.accessibility.reducedMotion,
    });
    this.stack.push(featureScreen('chapters', timeline));
  }

  private selectSlot(slot: ChapterId): void {
    const id = chapterForSlot(slot);
    if (!id) {
      this.game.bus.emit('ui:toast', { textKey: 'gameplay.chapter.unavailable' });
      return;
    }
    this.beginChapter(id, false);
  }

  /** Loads a chapter, shows the content note when needed, then opens the briefing. */
  beginChapter(id: string, resume: boolean): void {
    const mine = ++this.token;
    loadChapter(id)
      .then((ch) => {
        if (mine !== this.token || this.game.flow.state !== 'hub') return;
        const s = this.game.getState();
        const snapMission = resume ? s.resume.mission?.missionId : undefined;
        const fromSnap = snapMission ? ch.content.missions.findIndex((m) => m.id === snapMission) : -1;
        this.run = new ChapterRun(ch, fromSnap >= 0 ? fromSnap : nextMissionIndex(s, ch.content));
        if (this.run.needsContentNote && !resume) {
          this.stack.push(
            contentNoteScreen(
              this.t,
              ch.content.titleKey,
              (mode) => {
                this.game.settings.update('accessibility', { contentIntensity: mode });
                void this.openBriefing();
              },
              () => this.stack.pop(),
            ),
          );
        } else void this.openBriefing();
      })
      .catch((e: unknown) => {
        console.error('[netivim] chapter ' + id + ' failed to load', e);
        this.game.bus.emit('ui:toast', { textKey: 'gameplay.chapter.unavailable' });
      });
  }

  /** Loads the current mission's level, then moves the flow to the briefing. */
  private async openBriefing(): Promise<void> {
    const run = this.run;
    if (!run) return;
    const mine = ++this.token;
    this.levelDef = await loadLevel(run.levelId);
    if (mine !== this.token) return;
    const flow = this.game.flow;
    if (flow.state === 'hub') flow.send('openBriefing');
    else if (flow.state === 'debrief') flow.send('nextMission');
  }

  private resumeSnapshotFor(missionId: string): ReturnType<Game['getState']>['resume']['mission'] {
    const snap = this.game.getState().resume.mission;
    return snap && snap.missionId === missionId ? snap : null;
  }

  private showBriefing(): void {
    const run = this.run;
    const def = this.levelDef;
    if (!run || !def) {
      this.game.flow.send('back');
      return;
    }
    const meta = run.mission;
    const resumes = this.resumeSnapshotFor(meta.id) !== null && this.game.getState().resume.mission?.data !== null;
    this.stack.reset(
      briefingScreen(this.t, {
        chapter: run.chapter.content,
        mission: meta,
        contextKey: run.chapter.briefingContextKey,
        map: def.briefingMap ?? null,
        difficultyKey: 'gameplay.difficulty.' + this.game.settings.value.gameplay.difficulty,
        resumes,
        onStart: () => this.enterMission(),
        onBack: () => this.game.flow.send('back'),
      }),
    );
  }

  // ---- mission ------------------------------------------------------------------------------

  /** Mission-start autosave happens BEFORE the flow becomes volatile (BRIEF 8.B). */
  private enterMission(): void {
    const run = this.run;
    const def = this.levelDef;
    if (!run || !def) return;
    const chapterId = run.chapter.content.id;
    const snap = this.resumeSnapshotFor(def.missionId);
    const s = this.game.getState();
    this.game.setState(snap ? withMissionSnapshot(s, chapterId, snap) : atMissionStart(s, chapterId, def.missionId, def.mission.machine.initial));
    this.game.save.autosave('mission-start');
    this.game.flow.send('startMission');
  }

  private startMission(): void {
    const run = this.run;
    const def = this.levelDef;
    if (!run || !def) {
      this.game.flow.send('abandon');
      return;
    }
    const game = this.game;
    const hud = new MissionHud(game, this.t);
    this.hud = hud;
    const host = new MissionHost({
      def,
      bus: game.bus,
      input: game.input,
      difficulty: () => game.settings.value.gameplay.difficulty,
      headless: false,
      quality: worldQualityFromSettings(game.settings.value),
      reducedMotion: () => game.settings.value.accessibility.reducedMotion,
      t: this.t,
      glyph: (a) => glyphFor(a, game.input.device, game.input.family).label,
      recordChoice: (d, opt) => game.setState(recordChoice(game.getState(), d, opt)),
      snapshot: this.resumeSnapshotFor(def.missionId),
      hooks: {
        onFailed: (r) => {
          const retry = (): void => {
            this.stack.clear();
            host.retry();
          };
          this.stack.push(
            failureScreen(
              this.t,
              r,
              () => {
                if (r.assistOptions.length > 0) host.declineAssist();
                retry();
              },
              (o) => {
                host.acceptAssist(o);
                retry();
              },
            ),
          );
        },
        onDecision: (d, choose) => {
          this.stack.push(
            decisionScreen(this.t, d, (opt) => {
              this.stack.clear();
              choose(opt);
            }),
          );
        },
        onPlan: (model, confirm) => {
          this.stack.push(
            plannerScreen(
              this.t,
              model,
              () => {
                this.stack.clear();
                confirm();
              },
              () => undefined,
            ),
          );
        },
        onComplete: () => this.onMissionComplete(),
        onHint: (k) => hud.showHint(k),
        onSay: (_lines, label) => hud.showTestimony(label),
        onAlert: (v) => hud.setAlert(v),
      },
    });
    this.host = host;
    const level = host.start();
    game.scenes.switchTo(level.scene);
    hud.attach(host);
  }

  private onMissionComplete(): void {
    const run = this.run;
    const host = this.host;
    if (!run || !host) return;
    const chapterId = run.chapter.content.id;
    this.chapterEnd = run.isLastMission;
    this.game.setState(completeMission(this.game.getState(), chapterId, host.def.missionId));
    const cine = this.cinematics();
    const cutscene = run.chapter.cutsceneId;
    const event = run.afterMission(!!cine && !!cutscene);
    if (event === 'playCutscene' && cine && cutscene && cine.play(cutscene, 'toDebrief')) return;
    this.game.flow.send('missionDone');
  }

  /** Cinematics API: only reachable through its test hook today (contract request filed). */
  private cinematics(): CinematicsLike | null {
    return (window as unknown as { __netivimCinematics?: CinematicsLike }).__netivimCinematics ?? null;
  }

  private disposeHud(): void {
    this.hud?.dispose();
    this.hud = null;
  }

  /**
   * Leaves the mission. The level scene may still be the active scene (debrief, quiz): the
   * SceneManager frees it on the next switch (Level/GameScene dispose is idempotent).
   */
  private cleanupMission(): void {
    this.disposeHud();
    const host = this.host;
    if (!host) return;
    this.host = null;
    if (host.level && this.game.scenes.active === host.level.scene) host.interactions.clear();
    else host.dispose();
  }

  // ---- debrief / quiz -----------------------------------------------------------------------

  private showDebrief(): void {
    const run = this.run;
    if (!run) {
      this.game.flow.send('toHub');
      return;
    }
    const decisions = this.chapterEnd ? run.chapter.decisions : (this.levelDef?.decisions ?? []);
    const rows = ledgerRows(decisions, this.game.getState().choices);
    const titleKey = this.chapterEnd ? run.chapter.content.titleKey : run.mission.titleKey;
    this.stack.reset(
      debriefScreen(this.t, titleKey, rows, this.chapterEnd, () => {
        const event = run.afterDebrief();
        if (event === 'nextMission') void this.openBriefing();
        else this.game.flow.send(event);
      }),
    );
  }

  private showQuiz(): void {
    const run = this.run;
    if (!run) {
      this.game.flow.send('toHub');
      return;
    }
    const ch = run.chapter;
    this.stack.reset(
      quizScreen(this.t, ch.content, ch.content.facts, (r) => {
        let s = this.game.getState();
        for (const f of ch.content.facts) s = applyUnlock(s, 'fact', f.id);
        for (const c of ch.content.codex) s = applyUnlock(s, 'codex', c.id);
        if (r.stars === 3) s = applyUnlock(s, 'achievement', 'quiz-' + ch.content.id);
        this.game.setState(completeChapter(s, ch.content.id));
        this.game.bus.emit('ui:toast', { textKey: 'gameplay.toast.chapterDone' });
        this.run = null;
        this.game.flow.send('toHub');
      }),
    );
  }

  // ---- codex / archive ----------------------------------------------------------------------

  async openCodex(): Promise<void> {
    const mine = this.token;
    const chapters = await loadAllChapters();
    if (mine !== this.token || this.game.flow.state !== 'hub') return;
    this.stack.push(codexScreen(this.t, chapters, new Set(this.game.getState().unlocks.codex), () => this.stack.pop()));
  }

  async openArchive(): Promise<void> {
    const mine = this.token;
    const chapters: ChapterDefinition[] = await loadAllChapters();
    if (mine !== this.token || this.game.flow.state !== 'hub') return;
    this.stack.push(archiveListScreen(this.t, chapters, new Set(this.game.getState().unlocks.archive), (e) => this.openViewer(e), () => this.stack.pop()));
  }

  private openViewer(e: ArchiveEntry): void {
    const game = this.game;
    const viewer = createArchiveViewer(e.item, this.t(e.item.titleKey), this.t(e.item.descriptionKey), () => game.settings.value.accessibility.reducedMotion);
    game.scenes.switchTo(viewer);
    this.viewerOpen = true;
    const screen = provenanceScreen(this.t, e, () => {
      this.stack.pop();
      void this.restoreHubScene();
    });
    this.stack.push({ ...screen, update: (dt, a) => viewer.turn(a.lookX + a.moveX, a.lookY + a.moveY, dt) });
  }

  private async restoreHubScene(): Promise<void> {
    if (!this.viewerOpen) return;
    this.viewerOpen = false;
    const { createHubScene } = await import('../scene/hubScene');
    if (this.game.flow.state !== 'hub') return;
    this.game.scenes.switchTo(createHubScene({ quality: worldQualityFromSettings(this.game.settings.value) }));
  }
}
