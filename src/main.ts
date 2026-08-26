import './style.css';

import { GameAudio } from './audio';
import {
  BOSS_CAMPAIGN_LEVELS,
  getBossCampaignLevel,
  getNextBossCampaignLevel,
  isBossCampaignLevelUnlocked,
} from './game/boss-campaign';
import { applyBossAction, createInitialBossState, getEmployeeGoalKind } from './game/boss-logic';
import { findBossCapturePlan, findEmployeeEscapePlan } from './game/boss-solver';
import {
  CAMPAIGN_LEVELS,
  getCampaignLevel,
  getNextCampaignLevel,
  isCampaignLevelUnlocked,
} from './game/campaign';
import { generateDailyChallenge } from './game/challenge';
import { formatChineseDate, getShanghaiDateKey } from './game/date';
import { applyAction, createInitialState } from './game/logic';
import { findSolution } from './game/solver';
import type {
  BossAction,
  BossCampaignLevel,
  BossChallengeDefinition,
  BossGameEffect,
  BossGameState,
  CampaignLevel,
  ChallengeDefinition,
  ChallengeEvent,
  Direction,
  GameAction,
  GameEffect,
  GameMode,
  GameState,
  RunResult,
} from './game/types';
import {
  loadSave,
  persistSave,
  recordBossCampaignCompletion,
  recordCampaignCompletion,
  recordWin,
  type SaveData,
} from './persistence';
import { renderBoard, renderBossBoard, TILE_SIZE } from './renderer';
import { buildShareText, writeClipboard } from './share';

interface GameSession {
  challenge: ChallengeDefinition;
  state: GameState;
  playerFacing: Direction;
}

interface BossSession {
  challenge: BossChallengeDefinition;
  state: BossGameState;
}

type TutorialKind = 'employee' | 'boss';

declare global {
  interface Window {
    __NO_OVERTIME_DEBUG__?: {
      getMode: () => GameMode;
      getChallenge: () => ChallengeDefinition | BossChallengeDefinition | null;
      getSolution: () => GameAction[] | null;
      getState: () => GameState | null;
      getBossSolution: () => BossAction[] | null;
      getBossEscapePlan: () => BossAction[] | null;
      getBossState: () => BossGameState | null;
      dispatch: (action: GameAction) => void;
      dispatchBoss: (action: BossAction) => void;
      startCampaignLevel: (levelId: string) => void;
      startBossLevel: (levelId: string) => void;
      showCampaignSelection: () => void;
      showBossSelection: () => void;
    };
  }
}

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('Missing #app root.');

appRoot.innerHTML = `
  <main class="page-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">OFFICE STEALTH PUZZLE</p>
        <h1>今天不加班</h1>
        <p class="subtitle">当员工准点开溜，或当老板抓个现行。</p>
      </div>
      <div class="date-chip" id="dateLabel"></div>
    </header>

    <nav class="mode-switch" aria-label="游戏模式">
      <button type="button" data-mode="daily" aria-selected="true">
        <span>每日挑战</span><small>今天同一张地图</small>
      </button>
      <button type="button" data-mode="campaign" aria-selected="false">
        <span>员工闯关</span><small id="campaignTabProgress">0 / 5 已通关</small>
      </button>
      <button type="button" data-mode="boss-campaign" aria-selected="false">
        <span>老板模式</span><small id="bossTabProgress">0 / 5 已通关</small>
      </button>
    </nav>

    <section class="game-card" aria-label="办公室潜行挑战">
      <section class="campaign-select" id="campaignSelect" hidden aria-labelledby="campaignTitle">
        <div class="campaign-heading">
          <div>
            <p class="modal-kicker">EMPLOYEE · 五关下班训练</p>
            <h2 id="campaignTitle">选一关，继续开溜</h2>
          </div>
          <strong id="campaignProgress">0 / 5</strong>
        </div>
        <div class="level-grid" id="levelGrid"></div>
        <p class="campaign-note">通关后依次解锁 · 已通关关卡可重复挑战 · 进度保存在当前浏览器</p>
      </section>

      <section class="campaign-select boss-select" id="bossCampaignSelect" hidden aria-labelledby="bossCampaignTitle">
        <div class="campaign-heading">
          <div>
            <p class="modal-kicker">BOSS · 五关巡查训练</p>
            <h2 id="bossCampaignTitle">选一关，开始巡查</h2>
          </div>
          <strong id="bossCampaignProgress">0 / 5</strong>
        </div>
        <div class="level-grid" id="bossLevelGrid"></div>
        <p class="campaign-note">老板进度独立解锁 · 每关只有 2 次停留和 2 次掉头 · 无法长期守电梯</p>
      </section>

      <div id="playView">
        <div class="toolbar">
          <div class="stat"><span id="firstStatLabel">会议倒计时</span><strong id="turnValue">30</strong></div>
          <div class="stat"><span id="secondStatLabel">老板怀疑</span><strong id="suspicionValue" aria-label="怀疑值 0/2">○○</strong></div>
          <div class="stat"><span id="thirdStatLabel">门禁卡</span><strong id="cardValue">未拿到</strong></div>
          <div class="stat"><span id="fourthStatLabel">今日最佳</span><strong id="bestValue">--</strong></div>
        </div>

        <div class="event-strip" id="eventStrip" role="status" aria-live="polite"></div>

        <div class="board-wrap">
          <canvas
            id="gameCanvas"
            width="160"
            height="128"
            tabindex="0"
            role="img"
            aria-label="10乘8办公室地图。使用方向键、WASD、点按相邻格或屏幕按钮操作。"
          ></canvas>
          <div class="toast" id="toast" role="status" aria-live="assertive"></div>
        </div>

        <div class="legend" id="employeeLegend" aria-label="员工模式地图图例">
          <span><i class="legend-dot current"></i>当前视野</span>
          <span><i class="legend-dot next"></i>下一步视野</span>
          <span><i class="legend-card">▣</i>门禁卡</span>
          <span><i class="legend-elevator">▥</i>电梯</span>
        </div>
        <div class="legend" id="bossLegend" hidden aria-label="老板模式地图图例">
          <span><i class="legend-dot current"></i>当前视野</span>
          <span><i class="legend-dot forward"></i>继续落点</span>
          <span><i class="legend-dot reverse"></i>掉头落点</span>
          <span><i class="legend-dot target"></i>员工目标</span>
        </div>

        <div class="controls-row">
          <div class="dpad" id="employeeControls" aria-label="移动方向键">
            <button type="button" data-action="up" aria-label="向上">▲</button>
            <button type="button" data-action="left" aria-label="向左">◀</button>
            <button type="button" data-action="wait" class="wait-button" aria-label="原地等待">等</button>
            <button type="button" data-action="right" aria-label="向右">▶</button>
            <button type="button" data-action="down" aria-label="向下">▼</button>
          </div>
          <div class="boss-controls" id="bossControls" hidden aria-label="老板巡逻调度">
            <button type="button" data-boss-action="reverse">
              <span>◀ 掉头</span><small id="reverseHint">剩余 2</small>
            </button>
            <button type="button" data-boss-action="hold">
              <span>■ 停留</span><small id="holdHint">剩余 2</small>
            </button>
            <button type="button" data-boss-action="advance">
              <span>继续 ▶</span><small>沿当前方向</small>
            </button>
          </div>
          <div class="utility-buttons">
            <button type="button" id="levelsButton" class="secondary-button" hidden>返回选关</button>
            <button type="button" id="helpButton" class="secondary-button">怎么玩</button>
            <button type="button" id="muteButton" class="secondary-button">声音：开</button>
            <button type="button" id="restartButton" class="danger-button">重新开溜</button>
          </div>
        </div>
      </div>
    </section>

    <p class="footer-note" id="footerNote">每天 00:00（北京时间）刷新同一张地图 · 当天不限次数</p>
  </main>

  <section class="modal-backdrop" id="tutorialModal" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="tutorialTitle">
      <p class="modal-kicker" id="tutorialKicker"></p>
      <h2 id="tutorialTitle"></h2>
      <ol class="tutorial-list" id="tutorialList"></ol>
      <button type="button" id="startButton" class="primary-button"></button>
    </div>
  </section>

  <section class="modal-backdrop" id="resultModal" aria-hidden="true">
    <div class="modal result-modal" role="dialog" aria-modal="true" aria-labelledby="resultTitle">
      <p class="modal-kicker" id="resultKicker"></p>
      <h2 id="resultTitle"></h2>
      <p id="resultMessage" class="result-message"></p>
      <div id="resultStats" class="result-stats"></div>
      <textarea id="shareFallback" class="share-fallback" readonly hidden aria-label="分享文案"></textarea>
      <div class="result-actions">
        <button type="button" id="resultPrimaryButton" class="primary-button"></button>
        <button type="button" id="resultSecondaryButton" class="secondary-button"></button>
      </div>
    </div>
  </section>
`;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function eventName(event: ChallengeEvent): string {
  if (event.kind === 'meeting') return '临时会议：老板突然掉头';
  if (event.kind === 'blackout') return '办公室停电：老板视野暂时缩短';
  return '清洁车出动：一条通道暂时封住';
}

function basePageUrl(): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function createSession(challenge: ChallengeDefinition): GameSession {
  return {
    challenge,
    state: createInitialState(challenge),
    playerFacing: 'down',
  };
}

function createBossSession(challenge: BossChallengeDefinition): BossSession {
  return { challenge, state: createInitialBossState(challenge) };
}

class GameApp {
  private mode: GameMode = 'daily';
  private readonly dailySession: GameSession;
  private campaignSession: GameSession | null = null;
  private campaignSelecting = false;
  private bossSession: BossSession | null = null;
  private bossSelecting = false;
  private save: SaveData;
  private readonly audio: GameAudio;
  private latestDailyResult: RunResult | null = null;
  private tutorialKind: TutorialKind = 'employee';
  private toastTimer: number | null = null;
  private primaryResultAction: (() => void) | null = null;
  private secondaryResultAction: (() => void) | null = null;

  private readonly canvas = requireElement<HTMLCanvasElement>('#gameCanvas');
  private readonly dateLabel = requireElement<HTMLElement>('#dateLabel');
  private readonly playView = requireElement<HTMLElement>('#playView');
  private readonly campaignSelect = requireElement<HTMLElement>('#campaignSelect');
  private readonly bossCampaignSelect = requireElement<HTMLElement>('#bossCampaignSelect');
  private readonly campaignProgress = requireElement<HTMLElement>('#campaignProgress');
  private readonly bossCampaignProgress = requireElement<HTMLElement>('#bossCampaignProgress');
  private readonly campaignTabProgress = requireElement<HTMLElement>('#campaignTabProgress');
  private readonly bossTabProgress = requireElement<HTMLElement>('#bossTabProgress');
  private readonly levelGrid = requireElement<HTMLElement>('#levelGrid');
  private readonly bossLevelGrid = requireElement<HTMLElement>('#bossLevelGrid');
  private readonly firstStatLabel = requireElement<HTMLElement>('#firstStatLabel');
  private readonly secondStatLabel = requireElement<HTMLElement>('#secondStatLabel');
  private readonly thirdStatLabel = requireElement<HTMLElement>('#thirdStatLabel');
  private readonly fourthStatLabel = requireElement<HTMLElement>('#fourthStatLabel');
  private readonly turnValue = requireElement<HTMLElement>('#turnValue');
  private readonly suspicionValue = requireElement<HTMLElement>('#suspicionValue');
  private readonly cardValue = requireElement<HTMLElement>('#cardValue');
  private readonly bestValue = requireElement<HTMLElement>('#bestValue');
  private readonly eventStrip = requireElement<HTMLElement>('#eventStrip');
  private readonly toast = requireElement<HTMLElement>('#toast');
  private readonly employeeControls = requireElement<HTMLElement>('#employeeControls');
  private readonly bossControls = requireElement<HTMLElement>('#bossControls');
  private readonly employeeLegend = requireElement<HTMLElement>('#employeeLegend');
  private readonly bossLegend = requireElement<HTMLElement>('#bossLegend');
  private readonly holdHint = requireElement<HTMLElement>('#holdHint');
  private readonly reverseHint = requireElement<HTMLElement>('#reverseHint');
  private readonly muteButton = requireElement<HTMLButtonElement>('#muteButton');
  private readonly restartButton = requireElement<HTMLButtonElement>('#restartButton');
  private readonly levelsButton = requireElement<HTMLButtonElement>('#levelsButton');
  private readonly footerNote = requireElement<HTMLElement>('#footerNote');
  private readonly tutorialModal = requireElement<HTMLElement>('#tutorialModal');
  private readonly tutorialKicker = requireElement<HTMLElement>('#tutorialKicker');
  private readonly tutorialTitle = requireElement<HTMLElement>('#tutorialTitle');
  private readonly tutorialList = requireElement<HTMLOListElement>('#tutorialList');
  private readonly startButton = requireElement<HTMLButtonElement>('#startButton');
  private readonly resultModal = requireElement<HTMLElement>('#resultModal');
  private readonly resultKicker = requireElement<HTMLElement>('#resultKicker');
  private readonly resultTitle = requireElement<HTMLElement>('#resultTitle');
  private readonly resultMessage = requireElement<HTMLElement>('#resultMessage');
  private readonly resultStats = requireElement<HTMLElement>('#resultStats');
  private readonly resultPrimaryButton = requireElement<HTMLButtonElement>('#resultPrimaryButton');
  private readonly resultSecondaryButton = requireElement<HTMLButtonElement>('#resultSecondaryButton');
  private readonly shareFallback = requireElement<HTMLTextAreaElement>('#shareFallback');

  public constructor(dateKey: string) {
    this.dailySession = createSession(generateDailyChallenge(dateKey));
    this.save = loadSave(window.localStorage);
    this.audio = new GameAudio(this.save.muted);
    this.bindEvents();
    this.persist();
    this.render();
    if (!this.save.seenTutorial) this.openTutorial('employee');
    this.installDebugApi();
  }

  private get activeSession(): GameSession | null {
    if (this.mode === 'daily') return this.dailySession;
    if (this.mode === 'campaign') return this.campaignSelecting ? null : this.campaignSession;
    return null;
  }

  private get activeBossSession(): BossSession | null {
    return this.mode === 'boss-campaign' && !this.bossSelecting ? this.bossSession : null;
  }

  private installDebugApi(): void {
    if (!import.meta.env.DEV) return;
    window.__NO_OVERTIME_DEBUG__ = {
      getMode: () => this.mode,
      getChallenge: () => this.activeBossSession?.challenge ?? this.activeSession?.challenge ?? null,
      getSolution: () => {
        const session = this.activeSession;
        return session ? findSolution(session.challenge, 0) : null;
      },
      getState: () => {
        const state = this.activeSession?.state;
        return state ? { ...state, player: { ...state.player } } : null;
      },
      getBossSolution: () => {
        const session = this.activeBossSession;
        return session ? findBossCapturePlan(session.challenge) : null;
      },
      getBossEscapePlan: () => {
        const session = this.activeBossSession;
        return session ? findEmployeeEscapePlan(session.challenge) : null;
      },
      getBossState: () => {
        const state = this.activeBossSession?.state;
        return state ? { ...state, employee: { ...state.employee } } : null;
      },
      dispatch: (action) => this.dispatch(action),
      dispatchBoss: (action) => this.dispatchBoss(action),
      startCampaignLevel: (levelId) => {
        const level = getCampaignLevel(levelId);
        if (level && isCampaignLevelUnlocked(level, this.save.campaignProgress)) {
          this.startCampaignLevel(level);
        }
      },
      startBossLevel: (levelId) => {
        const level = getBossCampaignLevel(levelId);
        if (level && isBossCampaignLevelUnlocked(level, this.save.bossCampaignProgress)) {
          this.startBossLevel(level);
        }
      },
      showCampaignSelection: () => this.showCampaignSelection(),
      showBossSelection: () => this.showBossSelection(),
    };
  }

  private bindEvents(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this.dispatch(button.dataset.action as GameAction));
    });
    document.querySelectorAll<HTMLButtonElement>('[data-boss-action]').forEach((button) => {
      button.addEventListener('click', () =>
        this.dispatchBoss(button.dataset.bossAction as BossAction),
      );
    });
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => this.switchMode(button.dataset.mode as GameMode));
    });
    this.levelGrid.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-level-id]');
      if (!button || button.disabled) return;
      const level = getCampaignLevel(button.dataset.levelId ?? '');
      if (level) this.startCampaignLevel(level);
    });
    this.bossLevelGrid.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-boss-level-id]');
      if (!button || button.disabled) return;
      const level = getBossCampaignLevel(button.dataset.bossLevelId ?? '');
      if (level) this.startBossLevel(level);
    });

    document.addEventListener('keydown', (event) => {
      if (this.isModalOpen()) return;
      if (this.activeBossSession) {
        const bossMapping: Record<string, BossAction | undefined> = {
          ArrowRight: 'advance',
          d: 'advance',
          D: 'advance',
          ArrowLeft: 'reverse',
          a: 'reverse',
          A: 'reverse',
          ' ': 'hold',
        };
        const bossAction = bossMapping[event.key];
        if (bossAction) {
          event.preventDefault();
          this.dispatchBoss(bossAction);
        }
        return;
      }
      if (!this.activeSession) return;
      const mapping: Record<string, GameAction | undefined> = {
        ArrowUp: 'up',
        w: 'up',
        W: 'up',
        ArrowRight: 'right',
        d: 'right',
        D: 'right',
        ArrowDown: 'down',
        s: 'down',
        S: 'down',
        ArrowLeft: 'left',
        a: 'left',
        A: 'left',
        ' ': 'wait',
      };
      const action = mapping[event.key];
      if (action) {
        event.preventDefault();
        this.dispatch(action);
      }
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      const session = this.activeSession;
      if (this.isModalOpen() || !session || session.state.status !== 'playing') return;
      const bounds = this.canvas.getBoundingClientRect();
      const x = Math.floor(
        (((event.clientX - bounds.left) / bounds.width) * this.canvas.width) / TILE_SIZE,
      );
      const y = Math.floor(
        (((event.clientY - bounds.top) / bounds.height) * this.canvas.height) / TILE_SIZE,
      );
      const deltaX = x - session.state.player.x;
      const deltaY = y - session.state.player.y;
      if (deltaX === 0 && deltaY === 0) this.dispatch('wait');
      else if (deltaX === 1 && deltaY === 0) this.dispatch('right');
      else if (deltaX === -1 && deltaY === 0) this.dispatch('left');
      else if (deltaX === 0 && deltaY === 1) this.dispatch('down');
      else if (deltaX === 0 && deltaY === -1) this.dispatch('up');
      else this.showToast('只能移动到相邻格');
    });

    this.startButton.addEventListener('click', () => {
      this.save =
        this.tutorialKind === 'boss'
          ? { ...this.save, seenBossTutorial: true }
          : { ...this.save, seenTutorial: true };
      this.persist();
      this.closeModal(this.tutorialModal);
      this.canvas.focus();
    });
    requireElement<HTMLButtonElement>('#helpButton').addEventListener('click', () => {
      this.openTutorial(this.mode === 'boss-campaign' ? 'boss' : 'employee');
    });
    this.muteButton.addEventListener('click', () => {
      this.save = { ...this.save, muted: !this.save.muted };
      this.audio.setMuted(this.save.muted);
      this.persist();
      this.render();
    });
    this.restartButton.addEventListener('click', () => this.restart());
    this.levelsButton.addEventListener('click', () => {
      if (this.mode === 'boss-campaign') this.showBossSelection();
      else this.showCampaignSelection();
    });
    this.resultPrimaryButton.addEventListener('click', () => this.primaryResultAction?.());
    this.resultSecondaryButton.addEventListener('click', () => this.secondaryResultAction?.());
  }

  private isModalOpen(): boolean {
    return document.querySelector('.modal-backdrop[data-open="true"]') !== null;
  }

  private openModal(modal: HTMLElement): void {
    modal.dataset.open = 'true';
    modal.setAttribute('aria-hidden', 'false');
  }

  private closeModal(modal: HTMLElement): void {
    modal.dataset.open = 'false';
    modal.setAttribute('aria-hidden', 'true');
  }

  private openTutorial(kind: TutorialKind): void {
    this.tutorialKind = kind;
    if (kind === 'boss') {
      this.tutorialKicker.textContent = '30 秒管理培训';
      this.tutorialTitle.textContent = '巡逻，也需要一点策略';
      this.tutorialList.innerHTML = `
        <li><b>判断员工目标</b><span>青色框会标记门禁卡区或电梯区，但不会泄露下一步。</span></li>
        <li><b>提交调度指令</b><span>右键继续、左键掉头、空格停留；员工不会偷看本回合指令。</span></li>
        <li><b>调度令很有限</b><span>每关只有两次停留、两次掉头，掉头后还要冷却两回合。</span></li>
        <li><b>抓住两次</b><span>第一次让员工回工位并丢卡；第二次或拖满 30 回合即可获胜。</span></li>
      `;
      this.startButton.textContent = '懂了，开始巡查';
    } else {
      this.tutorialKicker.textContent = '30 秒入职培训';
      this.tutorialTitle.textContent = '下班，需要一点策略';
      this.tutorialList.innerHTML = `
        <li><b>先拿门禁卡</b><span>黄色卡片的位置会随关卡变化。</span></li>
        <li><b>避开老板视野</b><span>红色是现在，金色是老板下一步。</span></li>
        <li><b>第一次还有救</b><span>被看到会回工位并丢卡；第二次直接加班。</span></li>
        <li><b>留意办公室事故</b><span>事件会提前一回合预告，可以原地等待。</span></li>
      `;
      this.startButton.textContent = '懂了，开始开溜';
    }
    this.openModal(this.tutorialModal);
  }

  private persist(): void {
    try {
      persistSave(window.localStorage, this.save);
    } catch {
      this.showToast('浏览器没有允许保存纪录');
    }
  }

  private switchMode(mode: GameMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'campaign' && !this.campaignSession) this.campaignSelecting = true;
    if (mode === 'boss-campaign' && !this.bossSession) this.bossSelecting = true;
    this.shareFallback.hidden = true;
    this.render();
  }

  private showCampaignSelection(): void {
    this.closeModal(this.resultModal);
    this.mode = 'campaign';
    this.campaignSelecting = true;
    this.shareFallback.hidden = true;
    this.render();
  }

  private showBossSelection(): void {
    this.closeModal(this.resultModal);
    this.mode = 'boss-campaign';
    this.bossSelecting = true;
    this.shareFallback.hidden = true;
    this.render();
  }

  private startCampaignLevel(level: CampaignLevel): void {
    if (!isCampaignLevelUnlocked(level, this.save.campaignProgress)) {
      this.showToast('先完成前面的关卡');
      return;
    }
    this.closeModal(this.resultModal);
    this.mode = 'campaign';
    this.campaignSelecting = false;
    this.campaignSession = createSession(level.challenge);
    this.shareFallback.hidden = true;
    this.render();
    this.showToast(`第 ${level.number} 关：${level.title}`);
  }

  private startBossLevel(level: BossCampaignLevel): void {
    if (!isBossCampaignLevelUnlocked(level, this.save.bossCampaignProgress)) {
      this.showToast('先完成前面的老板关卡');
      return;
    }
    this.closeModal(this.resultModal);
    this.mode = 'boss-campaign';
    this.bossSelecting = false;
    this.bossSession = createBossSession(level.challenge);
    this.shareFallback.hidden = true;
    this.render();
    this.showToast(`老板第 ${level.number} 关：${level.title}`);
    if (!this.save.seenBossTutorial) this.openTutorial('boss');
  }

  private restart(): void {
    const bossSession = this.activeBossSession;
    if (bossSession) {
      bossSession.state = createInitialBossState(bossSession.challenge);
      this.closeModal(this.resultModal);
      this.render();
      this.showToast('调度令已补满，重新巡查');
      return;
    }
    const session = this.activeSession;
    if (!session) return;
    session.state = createInitialState(session.challenge);
    session.playerFacing = 'down';
    if (session.challenge.mode === 'daily') this.latestDailyResult = null;
    this.shareFallback.hidden = true;
    this.closeModal(this.resultModal);
    this.render();
    this.showToast('同一张地图，换条路线试试');
  }

  public dispatch(action: GameAction): void {
    const session = this.activeSession;
    if (!session || session.state.status !== 'playing' || this.isModalOpen()) return;
    if (action !== 'wait') session.playerFacing = action;
    const transition = applyAction(session.challenge, session.state, action);
    session.state = transition.state;
    this.handleEffects(session, transition.effects);
    this.render();
  }

  public dispatchBoss(action: BossAction): void {
    const session = this.activeBossSession;
    if (!session || session.state.status !== 'playing' || this.isModalOpen()) return;
    const transition = applyBossAction(session.challenge, session.state, action);
    session.state = transition.state;
    this.handleBossEffects(session, transition.effects);
    this.render();
  }

  private handleEffects(session: GameSession, effects: GameEffect[]): void {
    if (effects.some((effect) => effect.kind === 'blocked')) {
      this.showToast('这边过不去');
      return;
    }
    if (effects.some((effect) => effect.kind === 'moved' || effect.kind === 'waited')) {
      this.audio.play('move');
    }
    for (const effect of effects) {
      if (effect.kind === 'card-picked') {
        this.audio.play('card');
        this.showToast('门禁卡到手，快去电梯！');
      } else if (effect.kind === 'event-started') {
        this.showToast(eventName(effect.event));
      } else if (effect.kind === 'detected') {
        this.audio.play('alert');
        this.showToast(effect.suspicion === 1 ? '被发现！回工位装忙，卡也没收了' : '老板：留下来开会。');
      } else if (effect.kind === 'won') {
        this.finishWin(session);
      } else if (effect.kind === 'lost') {
        this.finishLoss(session, effect.reason);
      }
    }
  }

  private handleBossEffects(session: BossSession, effects: BossGameEffect[]): void {
    const blocked = effects.find((effect) => effect.kind === 'blocked');
    if (blocked?.kind === 'blocked') {
      const message =
        blocked.reason === 'no-holds'
          ? '停留令已经用完'
          : blocked.reason === 'no-reversals'
            ? '掉头令已经用完'
            : blocked.reason === 'reverse-cooldown'
              ? '掉头还在冷却'
              : '本局已经结束';
      this.showToast(message);
      return;
    }
    if (
      effects.some(
        (effect) =>
          effect.kind === 'boss-moved' ||
          effect.kind === 'boss-held' ||
          effect.kind === 'boss-reversed',
      )
    ) {
      this.audio.play('move');
    }
    for (const effect of effects) {
      if (effect.kind === 'employee-card-picked') {
        this.audio.play('card');
        this.showToast('员工拿到门禁卡，目标已切换到电梯区');
      } else if (effect.kind === 'event-started') {
        this.showToast(eventName(effect.event));
      } else if (effect.kind === 'employee-caught') {
        this.audio.play('alert');
        this.showToast(effect.catches === 1 ? '抓到一次！员工回工位，门禁卡已收回' : '第二次抓到，巡查成功！');
      } else if (effect.kind === 'boss-won') {
        this.finishBossWin(session, effect.reason);
      } else if (effect.kind === 'employee-escaped') {
        this.finishBossLoss(session);
      }
    }
  }

  private configureResultActions(
    primaryLabel: string,
    primaryAction: () => void,
    secondaryLabel?: string,
    secondaryAction?: () => void,
  ): void {
    this.primaryResultAction = primaryAction;
    this.resultPrimaryButton.textContent = primaryLabel;
    this.resultPrimaryButton.hidden = false;
    this.secondaryResultAction = secondaryAction ?? null;
    this.resultSecondaryButton.textContent = secondaryLabel ?? '';
    this.resultSecondaryButton.hidden = !secondaryLabel || !secondaryAction;
  }

  private finishWin(session: GameSession): void {
    this.audio.play('win');
    if (session.challenge.mode === 'daily') {
      const result: RunResult = {
        dateKey: session.challenge.dateKey,
        turns: session.state.turn,
        suspicion: session.state.suspicion,
        completedAt: new Date().toISOString(),
      };
      this.latestDailyResult = result;
      this.save = recordWin(this.save, result);
      this.persist();
      this.resultKicker.textContent = 'SUCCESS · 电梯门已关';
      this.resultTitle.textContent = '今天也没有加班！';
      this.resultMessage.textContent =
        result.suspicion === 0
          ? '老板还在巡视，而你已经到家点外卖了。'
          : '过程有点惊险，但准时下班才是硬道理。';
      this.resultStats.innerHTML = `
        <div><strong>${result.turns}</strong><span>回合</span></div>
        <div><strong>${result.suspicion}</strong><span>次被发现</span></div>
        <div><strong>${this.save.streak}</strong><span>连续天数</span></div>
      `;
      this.configureResultActions(
        '复制战绩',
        () => void this.shareResult(),
        '再来一次',
        () => this.restart(),
      );
    } else {
      const level = getCampaignLevel(session.challenge.levelId);
      if (!level) throw new Error(`Unknown campaign level: ${session.challenge.levelId}`);
      this.save = recordCampaignCompletion(this.save, level.id);
      this.persist();
      const nextLevel = getNextCampaignLevel(level.id);
      const completedCount = this.completedCampaignCount;
      this.resultKicker.textContent = nextLevel ? `LEVEL ${level.number} CLEAR` : 'CAMPAIGN CLEAR';
      this.resultTitle.textContent = nextLevel ? `${level.title}完成！` : '员工五关全部通关！';
      this.resultMessage.textContent = nextLevel
        ? `下一关“${nextLevel.title}”已经解锁。`
        : '老板还在开会，而你已经掌握了全部下班技巧。';
      this.resultStats.innerHTML = `
        <div><strong>${session.state.turn}</strong><span>本局回合</span></div>
        <div><strong>${session.state.suspicion}</strong><span>次被发现</span></div>
        <div><strong>${completedCount}/5</strong><span>通关进度</span></div>
      `;
      if (nextLevel) {
        this.configureResultActions(
          '下一关',
          () => this.startCampaignLevel(nextLevel),
          '返回选关',
          () => this.showCampaignSelection(),
        );
      } else {
        this.configureResultActions(
          '返回选关',
          () => this.showCampaignSelection(),
          '再玩本关',
          () => this.startCampaignLevel(level),
        );
      }
    }
    this.shareFallback.hidden = true;
    this.openModal(this.resultModal);
  }

  private finishLoss(session: GameSession, reason: 'caught' | 'timeout'): void {
    this.audio.play('alert');
    if (session.challenge.mode === 'daily') this.latestDailyResult = null;
    this.resultKicker.textContent = 'OVERTIME · 临时会议已开始';
    this.resultTitle.textContent = reason === 'caught' ? '老板逮到你了' : '动作还是慢了一步';
    this.resultMessage.textContent =
      reason === 'caught'
        ? '第二次被发现，只能留下来听老板讲“简单同步两分钟”。'
        : '会议邀请已经弹出来了。记住老板路线，再试一次。';
    this.resultStats.innerHTML = `
      <div><strong>${session.state.turn}</strong><span>已用回合</span></div>
      <div><strong>${session.state.suspicion}</strong><span>怀疑值</span></div>
      <div><strong>∞</strong><span>重试次数</span></div>
    `;
    if (session.challenge.mode === 'campaign') {
      this.configureResultActions(
        '再试一次',
        () => this.restart(),
        '返回选关',
        () => this.showCampaignSelection(),
      );
    } else {
      this.configureResultActions('再来一次', () => this.restart());
    }
    this.shareFallback.hidden = true;
    this.openModal(this.resultModal);
  }

  private finishBossWin(
    session: BossSession,
    reason: 'caught' | 'timeout',
  ): void {
    this.audio.play('win');
    const level = getBossCampaignLevel(session.challenge.levelId);
    if (!level) throw new Error(`Unknown boss level: ${session.challenge.levelId}`);
    this.save = recordBossCampaignCompletion(this.save, level.id);
    this.persist();
    const nextLevel = getNextBossCampaignLevel(level.id);
    const completedCount = this.completedBossCampaignCount;
    const commandsUsed =
      session.challenge.actionLimits.holds - session.state.holdsRemaining +
      (session.challenge.actionLimits.reversals - session.state.reversalsRemaining);
    this.resultKicker.textContent = nextLevel ? `BOSS LEVEL ${level.number} CLEAR` : 'BOSS CAMPAIGN CLEAR';
    this.resultTitle.textContent = nextLevel ? `${level.title}完成！` : '老板五关全部通关！';
    this.resultMessage.textContent = nextLevel
      ? `${reason === 'caught' ? '两次抓到员工。' : '成功拖到下班倒计时结束。'}下一关“${nextLevel.title}”已经解锁。`
      : '今天谁也没能悄悄溜走，你已经掌握了全部巡查技巧。';
    this.resultStats.innerHTML = `
      <div><strong>${session.state.turn}</strong><span>本局回合</span></div>
      <div><strong>${session.state.catches}</strong><span>抓到次数</span></div>
      <div><strong>${nextLevel ? commandsUsed : `${completedCount}/${BOSS_CAMPAIGN_LEVELS.length}`}</strong><span>${nextLevel ? '调度令消耗' : '老板关进度'}</span></div>
    `;
    if (nextLevel) {
      this.configureResultActions(
        '下一关',
        () => this.startBossLevel(nextLevel),
        '返回选关',
        () => this.showBossSelection(),
      );
    } else {
      this.configureResultActions(
        '返回选关',
        () => this.showBossSelection(),
        '再玩本关',
        () => this.startBossLevel(level),
      );
    }
    this.shareFallback.hidden = true;
    this.openModal(this.resultModal);
    this.bossTabProgress.textContent = `${completedCount} / ${BOSS_CAMPAIGN_LEVELS.length} 已通关`;
  }

  private finishBossLoss(session: BossSession): void {
    this.audio.play('alert');
    const commandsLeft = session.state.holdsRemaining + session.state.reversalsRemaining;
    this.resultKicker.textContent = 'ESCAPED · 电梯门已关';
    this.resultTitle.textContent = '还是让员工溜了';
    this.resultMessage.textContent = '员工拿着门禁卡进入了电梯。重新判断目标区域，别把调度令用得太早。';
    this.resultStats.innerHTML = `
      <div><strong>${session.state.turn}</strong><span>已用回合</span></div>
      <div><strong>${session.state.catches}</strong><span>抓到次数</span></div>
      <div><strong>${commandsLeft}</strong><span>剩余调度令</span></div>
    `;
    this.configureResultActions(
      '再试一次',
      () => this.restart(),
      '返回选关',
      () => this.showBossSelection(),
    );
    this.shareFallback.hidden = true;
    this.openModal(this.resultModal);
  }

  private async shareResult(): Promise<void> {
    if (!this.latestDailyResult) return;
    const value = buildShareText(this.latestDailyResult, this.save.streak, basePageUrl());
    const copied = await writeClipboard(value);
    if (copied) {
      this.showToast('战绩已复制，发给同事比一比');
      this.resultPrimaryButton.textContent = '已复制 ✓';
      window.setTimeout(() => {
        this.resultPrimaryButton.textContent = '复制战绩';
      }, 1800);
    } else {
      this.shareFallback.value = value;
      this.shareFallback.hidden = false;
      this.shareFallback.focus();
      this.shareFallback.select();
      this.showToast('请手动复制下面的战绩');
    }
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.dataset.visible = 'true';
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.dataset.visible = 'false';
    }, 2300);
  }

  private get completedCampaignCount(): number {
    return CAMPAIGN_LEVELS.filter((level) =>
      this.save.campaignProgress.completedLevelIds.includes(level.id),
    ).length;
  }

  private get completedBossCampaignCount(): number {
    return BOSS_CAMPAIGN_LEVELS.filter((level) =>
      this.save.bossCampaignProgress.completedLevelIds.includes(level.id),
    ).length;
  }

  private renderLevelCards(
    levels: Array<CampaignLevel | BossCampaignLevel>,
    completedLevelIds: string[],
    isUnlocked: (level: CampaignLevel | BossCampaignLevel) => boolean,
    dataAttribute: 'data-level-id' | 'data-boss-level-id',
  ): string {
    return levels
      .map((level) => {
        const completed = completedLevelIds.includes(level.id);
        const unlocked = isUnlocked(level);
        const stateClass = completed ? 'completed' : unlocked ? 'unlocked' : 'locked';
        const stateLabel = completed ? '已通关 ✓' : unlocked ? '可以挑战' : '尚未解锁';
        const symbol = completed ? '✓' : unlocked ? String(level.number).padStart(2, '0') : '▣';
        return `
          <button
            type="button"
            class="level-card ${stateClass}"
            ${dataAttribute}="${level.id}"
            ${unlocked ? '' : 'disabled'}
            aria-label="第 ${level.number} 关 ${level.title}，${stateLabel}"
          >
            <span class="level-number">${symbol}</span>
            <span class="level-copy">
              <small>LEVEL ${String(level.number).padStart(2, '0')}</small>
              <strong>${level.title}</strong>
              <em>${level.description}</em>
            </span>
            <span class="level-state">${stateLabel}</span>
          </button>
        `;
      })
      .join('');
  }

  private renderCampaignSelector(): void {
    const completedCount = this.completedCampaignCount;
    this.campaignProgress.textContent = `${completedCount} / ${CAMPAIGN_LEVELS.length}`;
    this.levelGrid.innerHTML = this.renderLevelCards(
      CAMPAIGN_LEVELS,
      this.save.campaignProgress.completedLevelIds,
      (level) => isCampaignLevelUnlocked(level as CampaignLevel, this.save.campaignProgress),
      'data-level-id',
    );
  }

  private renderBossSelector(): void {
    const completedCount = this.completedBossCampaignCount;
    this.bossCampaignProgress.textContent = `${completedCount} / ${BOSS_CAMPAIGN_LEVELS.length}`;
    this.bossLevelGrid.innerHTML = this.renderLevelCards(
      BOSS_CAMPAIGN_LEVELS,
      this.save.bossCampaignProgress.completedLevelIds,
      (level) =>
        isBossCampaignLevelUnlocked(
          level as BossCampaignLevel,
          this.save.bossCampaignProgress,
        ),
      'data-boss-level-id',
    );
  }

  private renderEventStrip(
    challenge: ChallengeDefinition | BossChallengeDefinition,
    turn: number,
  ): void {
    const warning = challenge.events.find((event) => event.triggerTurn === turn + 1);
    const active = challenge.events.find((event) => {
      if (event.kind === 'meeting') return false;
      return turn >= event.triggerTurn && turn < event.triggerTurn + event.duration;
    });
    if (warning) {
      this.eventStrip.className = 'event-strip warning';
      this.eventStrip.textContent = `⚠ 下一回合：${eventName(warning)}`;
    } else if (active) {
      this.eventStrip.className = 'event-strip active';
      this.eventStrip.textContent = `● 事件生效中：${eventName(active)}`;
    } else {
      const upcoming = challenge.events.find((event) => event.triggerTurn > turn);
      this.eventStrip.className = 'event-strip';
      if (upcoming) {
        this.eventStrip.textContent = `办公室暂时平静 · 第 ${upcoming.triggerTurn} 回合附近可能有事`;
      } else if (challenge.mode !== 'daily' && challenge.events.length === 0) {
        this.eventStrip.textContent = `${challenge.title} · ${challenge.description}`;
      } else if (challenge.mode === 'boss-campaign') {
        this.eventStrip.textContent = '意外已经结束 · 根据员工目标区域继续拦截';
      } else {
        this.eventStrip.textContent = '意外已经结束 · 抓紧去电梯';
      }
    }
  }

  private renderEmployeeGame(session: GameSession): void {
    renderBoard(this.canvas, session.challenge, session.state, session.playerFacing);
    this.firstStatLabel.textContent = '会议倒计时';
    this.secondStatLabel.textContent = '老板怀疑';
    this.thirdStatLabel.textContent = '门禁卡';
    this.turnValue.textContent = String(
      Math.max(0, session.challenge.turnLimit - session.state.turn),
    );
    this.suspicionValue.textContent = `${'●'.repeat(session.state.suspicion)}${'○'.repeat(2 - session.state.suspicion)}`;
    this.suspicionValue.setAttribute('aria-label', `怀疑值 ${session.state.suspicion}/2`);
    this.cardValue.textContent = session.state.hasCard ? '已拿到 ✓' : '未拿到';
    this.cardValue.classList.toggle('complete', session.state.hasCard);
    if (session.challenge.mode === 'daily') {
      this.fourthStatLabel.textContent = '今日最佳';
      const best = this.save.bestByDate[session.challenge.dateKey];
      this.bestValue.textContent = best ? `${best.turns} 回合` : '--';
      this.restartButton.textContent = '重新开溜';
    } else {
      this.fourthStatLabel.textContent = '当前关卡';
      this.bestValue.textContent = `${session.challenge.levelNumber} / ${CAMPAIGN_LEVELS.length}`;
      this.restartButton.textContent = '重玩本关';
    }
    this.employeeControls.hidden = false;
    this.bossControls.hidden = true;
    this.employeeLegend.hidden = false;
    this.bossLegend.hidden = true;
    this.levelsButton.hidden = session.challenge.mode !== 'campaign';
    this.levelsButton.textContent = '返回选关';
    this.canvas.setAttribute(
      'aria-label',
      '10乘8办公室地图。使用方向键、WASD、点按相邻格或屏幕方向键移动。',
    );
    this.renderEventStrip(session.challenge, session.state.turn);
  }

  private renderBossGame(session: BossSession): void {
    renderBossBoard(this.canvas, session.challenge, session.state);
    this.firstStatLabel.textContent = '剩余回合';
    this.secondStatLabel.textContent = '已抓到';
    this.thirdStatLabel.textContent = '员工目标';
    this.fourthStatLabel.textContent = '调度令';
    this.turnValue.textContent = String(
      Math.max(0, session.challenge.turnLimit - session.state.turn),
    );
    this.suspicionValue.textContent = `${'●'.repeat(session.state.catches)}${'○'.repeat(2 - session.state.catches)}`;
    this.suspicionValue.setAttribute('aria-label', `抓到次数 ${session.state.catches}/2`);
    this.cardValue.textContent =
      getEmployeeGoalKind(session.state) === 'card' ? '门禁卡区' : '电梯区';
    this.cardValue.classList.toggle('complete', session.state.employeeHasCard);
    this.bestValue.textContent = `停${session.state.holdsRemaining} · 转${session.state.reversalsRemaining}`;
    this.holdHint.textContent = `剩余 ${session.state.holdsRemaining}`;
    this.reverseHint.textContent =
      session.state.reverseCooldown > 0
        ? `冷却 ${session.state.reverseCooldown}`
        : `剩余 ${session.state.reversalsRemaining}`;
    this.employeeControls.hidden = true;
    this.bossControls.hidden = false;
    this.employeeLegend.hidden = true;
    this.bossLegend.hidden = false;
    this.levelsButton.hidden = false;
    this.levelsButton.textContent = '返回选关';
    this.restartButton.textContent = '重巡本关';
    this.canvas.setAttribute(
      'aria-label',
      '10乘8老板巡查地图。使用右键或D继续、空格停留、左键或A掉头。',
    );
    this.bossControls
      .querySelectorAll<HTMLButtonElement>('[data-boss-action]')
      .forEach((button) => {
        const action = button.dataset.bossAction as BossAction;
        button.disabled =
          session.state.status !== 'playing' ||
          (action === 'hold' && session.state.holdsRemaining <= 0) ||
          (action === 'reverse' &&
            (session.state.reversalsRemaining <= 0 || session.state.reverseCooldown > 0));
      });
    this.renderEventStrip(session.challenge, session.state.turn);
  }

  private render(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      const selected = button.dataset.mode === this.mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    const employeeCompleted = this.completedCampaignCount;
    const bossCompleted = this.completedBossCampaignCount;
    this.campaignTabProgress.textContent = `${employeeCompleted} / ${CAMPAIGN_LEVELS.length} 已通关`;
    this.bossTabProgress.textContent = `${bossCompleted} / ${BOSS_CAMPAIGN_LEVELS.length} 已通关`;

    const selectingEmployee = this.mode === 'campaign' && this.campaignSelecting;
    const selectingBoss = this.mode === 'boss-campaign' && this.bossSelecting;
    this.campaignSelect.hidden = !selectingEmployee;
    this.bossCampaignSelect.hidden = !selectingBoss;
    this.playView.hidden = selectingEmployee || selectingBoss;

    if (this.mode === 'daily') {
      const dailyChallenge = this.dailySession.challenge;
      if (dailyChallenge.mode !== 'daily') throw new Error('Daily session has an invalid challenge.');
      this.dateLabel.textContent = `${formatChineseDate(dailyChallenge.dateKey)} · #${String(dailyChallenge.seed).slice(-4)}`;
      this.footerNote.textContent = '每天 00:00（北京时间）刷新同一张地图 · 当天不限次数';
    } else if (this.mode === 'campaign') {
      this.dateLabel.textContent = `员工进度 · ${employeeCompleted}/${CAMPAIGN_LEVELS.length}`;
      this.footerNote.textContent = '员工五关依次解锁 · 未完成局面刷新后重开 · 通关进度保存在本机';
    } else {
      this.dateLabel.textContent = `老板进度 · ${bossCompleted}/${BOSS_CAMPAIGN_LEVELS.length}`;
      this.footerNote.textContent = '老板五关独立解锁 · 每关两次停留与掉头 · 通关进度保存在本机';
    }

    if (selectingEmployee) {
      this.renderCampaignSelector();
      return;
    }
    if (selectingBoss) {
      this.renderBossSelector();
      return;
    }

    const bossSession = this.activeBossSession;
    if (bossSession) this.renderBossGame(bossSession);
    else {
      const session = this.activeSession;
      if (session) this.renderEmployeeGame(session);
    }
    this.muteButton.textContent = this.save.muted ? '声音：关' : '声音：开';
    this.muteButton.setAttribute('aria-pressed', String(this.save.muted));
  }
}

new GameApp(getShanghaiDateKey());
