import './style.css';

import { GameAudio } from './audio';
import { generateDailyChallenge } from './game/challenge';
import { formatChineseDate, getShanghaiDateKey } from './game/date';
import { applyAction, createInitialState } from './game/logic';
import { findSolution } from './game/solver';
import type {
  ChallengeDefinition,
  ChallengeEvent,
  Direction,
  GameAction,
  GameEffect,
  GameState,
  RunResult,
} from './game/types';
import { loadSave, persistSave, recordWin, type SaveData } from './persistence';
import { renderBoard, TILE_SIZE } from './renderer';
import { buildShareText, writeClipboard } from './share';

declare global {
  interface Window {
    __NO_OVERTIME_DEBUG__?: {
      challenge: ChallengeDefinition;
      solution: GameAction[] | null;
      getState: () => GameState;
      dispatch: (action: GameAction) => void;
    };
  }
}

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) {
  throw new Error('Missing #app root.');
}

appRoot.innerHTML = `
  <main class="page-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">DAILY STEALTH PUZZLE</p>
        <h1>今天不加班</h1>
        <p class="subtitle">拿卡。躲老板。到电梯。别让临时会议抓住你。</p>
      </div>
      <div class="date-chip" id="dateLabel"></div>
    </header>

    <section class="game-card" aria-label="每日潜行挑战">
      <div class="toolbar">
        <div class="stat"><span>会议倒计时</span><strong id="turnValue">30</strong></div>
        <div class="stat"><span>老板怀疑</span><strong id="suspicionValue" aria-label="怀疑值 0/2">○○</strong></div>
        <div class="stat"><span>门禁卡</span><strong id="cardValue">未拿到</strong></div>
        <div class="stat"><span>今日最佳</span><strong id="bestValue">--</strong></div>
      </div>

      <div class="event-strip" id="eventStrip" role="status" aria-live="polite"></div>

      <div class="board-wrap">
        <canvas
          id="gameCanvas"
          width="160"
          height="128"
          role="img"
          aria-label="10乘8办公室地图。使用方向键、WASD、点按相邻格或屏幕方向键移动。"
        ></canvas>
        <div class="toast" id="toast" role="status" aria-live="assertive"></div>
      </div>

      <div class="legend" aria-label="地图图例">
        <span><i class="legend-dot current"></i>当前视野</span>
        <span><i class="legend-dot next"></i>下一步视野</span>
        <span><i class="legend-card">▣</i>门禁卡</span>
        <span><i class="legend-elevator">▥</i>电梯</span>
      </div>

      <div class="controls-row">
        <div class="dpad" aria-label="移动方向键">
          <button type="button" data-action="up" aria-label="向上">▲</button>
          <button type="button" data-action="left" aria-label="向左">◀</button>
          <button type="button" data-action="wait" class="wait-button" aria-label="原地等待">等</button>
          <button type="button" data-action="right" aria-label="向右">▶</button>
          <button type="button" data-action="down" aria-label="向下">▼</button>
        </div>
        <div class="utility-buttons">
          <button type="button" id="helpButton" class="secondary-button">怎么玩</button>
          <button type="button" id="muteButton" class="secondary-button">声音：开</button>
          <button type="button" id="restartButton" class="danger-button">重新开溜</button>
        </div>
      </div>
    </section>

    <p class="footer-note">每天 00:00（北京时间）刷新同一张地图 · 当天不限次数</p>
  </main>

  <section class="modal-backdrop" id="tutorialModal" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="tutorialTitle">
      <p class="modal-kicker">30 秒入职培训</p>
      <h2 id="tutorialTitle">下班，需要一点策略</h2>
      <ol class="tutorial-list">
        <li><b>先拿门禁卡</b><span>黄色卡片每天换位置。</span></li>
        <li><b>避开老板视野</b><span>红色是现在，金色是老板下一步。</span></li>
        <li><b>第一次还有救</b><span>被看到会回工位并丢卡；第二次直接加班。</span></li>
        <li><b>留意办公室事故</b><span>事件会提前一回合预告，可以原地等待。</span></li>
      </ol>
      <button type="button" id="startButton" class="primary-button">懂了，开始开溜</button>
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
        <button type="button" id="shareButton" class="primary-button">复制战绩</button>
        <button type="button" id="retryButton" class="secondary-button">再来一次</button>
      </div>
    </div>
  </section>
`;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
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

class GameApp {
  private readonly challenge: ChallengeDefinition;
  private state: GameState;
  private save: SaveData;
  private playerFacing: Direction = 'down';
  private readonly audio: GameAudio;
  private latestResult: RunResult | null = null;
  private toastTimer: number | null = null;

  private readonly canvas = requireElement<HTMLCanvasElement>('#gameCanvas');
  private readonly dateLabel = requireElement<HTMLElement>('#dateLabel');
  private readonly turnValue = requireElement<HTMLElement>('#turnValue');
  private readonly suspicionValue = requireElement<HTMLElement>('#suspicionValue');
  private readonly cardValue = requireElement<HTMLElement>('#cardValue');
  private readonly bestValue = requireElement<HTMLElement>('#bestValue');
  private readonly eventStrip = requireElement<HTMLElement>('#eventStrip');
  private readonly toast = requireElement<HTMLElement>('#toast');
  private readonly muteButton = requireElement<HTMLButtonElement>('#muteButton');
  private readonly tutorialModal = requireElement<HTMLElement>('#tutorialModal');
  private readonly resultModal = requireElement<HTMLElement>('#resultModal');
  private readonly resultKicker = requireElement<HTMLElement>('#resultKicker');
  private readonly resultTitle = requireElement<HTMLElement>('#resultTitle');
  private readonly resultMessage = requireElement<HTMLElement>('#resultMessage');
  private readonly resultStats = requireElement<HTMLElement>('#resultStats');
  private readonly shareButton = requireElement<HTMLButtonElement>('#shareButton');
  private readonly shareFallback = requireElement<HTMLTextAreaElement>('#shareFallback');

  public constructor(dateKey: string) {
    this.challenge = generateDailyChallenge(dateKey);
    this.state = createInitialState(this.challenge);
    this.save = loadSave(window.localStorage);
    this.audio = new GameAudio(this.save.muted);
    this.bindEvents();
    this.render();
    if (!this.save.seenTutorial) {
      this.openModal(this.tutorialModal);
    }
    if (import.meta.env.DEV) {
      window.__NO_OVERTIME_DEBUG__ = {
        challenge: this.challenge,
        solution: findSolution(this.challenge, 0),
        getState: () => ({ ...this.state, player: { ...this.state.player } }),
        dispatch: (action) => this.dispatch(action),
      };
    }
  }

  private bindEvents(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        this.dispatch(button.dataset.action as GameAction);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (this.isModalOpen()) return;
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
      if (this.isModalOpen() || this.state.status !== 'playing') return;
      const bounds = this.canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * this.canvas.width / TILE_SIZE);
      const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * this.canvas.height / TILE_SIZE);
      const deltaX = x - this.state.player.x;
      const deltaY = y - this.state.player.y;
      if (deltaX === 0 && deltaY === 0) this.dispatch('wait');
      else if (deltaX === 1 && deltaY === 0) this.dispatch('right');
      else if (deltaX === -1 && deltaY === 0) this.dispatch('left');
      else if (deltaX === 0 && deltaY === 1) this.dispatch('down');
      else if (deltaX === 0 && deltaY === -1) this.dispatch('up');
      else this.showToast('只能移动到相邻格');
    });

    requireElement<HTMLButtonElement>('#startButton').addEventListener('click', () => {
      this.save = { ...this.save, seenTutorial: true };
      this.persist();
      this.closeModal(this.tutorialModal);
      this.canvas.focus();
    });
    requireElement<HTMLButtonElement>('#helpButton').addEventListener('click', () => {
      this.openModal(this.tutorialModal);
    });
    this.muteButton.addEventListener('click', () => {
      this.save = { ...this.save, muted: !this.save.muted };
      this.audio.setMuted(this.save.muted);
      this.persist();
      this.render();
    });
    requireElement<HTMLButtonElement>('#restartButton').addEventListener('click', () => this.restart());
    requireElement<HTMLButtonElement>('#retryButton').addEventListener('click', () => {
      this.closeModal(this.resultModal);
      this.restart();
    });
    this.shareButton.addEventListener('click', () => void this.shareResult());
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

  private persist(): void {
    try {
      persistSave(window.localStorage, this.save);
    } catch {
      this.showToast('浏览器没有允许保存纪录');
    }
  }

  private restart(): void {
    this.state = createInitialState(this.challenge);
    this.playerFacing = 'down';
    this.latestResult = null;
    this.shareFallback.hidden = true;
    this.closeModal(this.resultModal);
    this.render();
    this.showToast('同一张地图，换条路线试试');
  }

  public dispatch(action: GameAction): void {
    if (this.state.status !== 'playing' || this.isModalOpen()) return;
    if (action !== 'wait') this.playerFacing = action;
    const transition = applyAction(this.challenge, this.state, action);
    this.state = transition.state;
    this.handleEffects(transition.effects);
    this.render();
  }

  private handleEffects(effects: GameEffect[]): void {
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
        this.finishWin();
      } else if (effect.kind === 'lost') {
        this.finishLoss(effect.reason);
      }
    }
  }

  private finishWin(): void {
    this.audio.play('win');
    const result: RunResult = {
      dateKey: this.challenge.dateKey,
      turns: this.state.turn,
      suspicion: this.state.suspicion,
      completedAt: new Date().toISOString(),
    };
    this.latestResult = result;
    this.save = recordWin(this.save, result);
    this.persist();
    this.resultKicker.textContent = 'SUCCESS · 电梯门已关';
    this.resultTitle.textContent = '今天也没有加班！';
    this.resultMessage.textContent =
      result.suspicion === 0 ? '老板还在巡视，而你已经到家点外卖了。' : '过程有点惊险，但准时下班才是硬道理。';
    this.resultStats.innerHTML = `
      <div><strong>${result.turns}</strong><span>回合</span></div>
      <div><strong>${result.suspicion}</strong><span>次被发现</span></div>
      <div><strong>${this.save.streak}</strong><span>连续天数</span></div>
    `;
    this.shareButton.hidden = false;
    this.shareFallback.hidden = true;
    this.openModal(this.resultModal);
  }

  private finishLoss(reason: 'caught' | 'timeout'): void {
    this.audio.play('alert');
    this.latestResult = null;
    this.resultKicker.textContent = 'OVERTIME · 临时会议已开始';
    this.resultTitle.textContent = reason === 'caught' ? '老板逮到你了' : '动作还是慢了一步';
    this.resultMessage.textContent =
      reason === 'caught'
        ? '第二次被发现，只能留下来听老板讲“简单同步两分钟”。'
        : '会议邀请已经弹出来了。记住老板路线，再试一次。';
    this.resultStats.innerHTML = `
      <div><strong>${this.state.turn}</strong><span>已用回合</span></div>
      <div><strong>${this.state.suspicion}</strong><span>怀疑值</span></div>
      <div><strong>∞</strong><span>今日重试</span></div>
    `;
    this.shareButton.hidden = true;
    this.shareFallback.hidden = true;
    this.openModal(this.resultModal);
  }

  private async shareResult(): Promise<void> {
    if (!this.latestResult) return;
    const value = buildShareText(this.latestResult, this.save.streak, basePageUrl());
    const copied = await writeClipboard(value);
    if (copied) {
      this.showToast('战绩已复制，发给同事比一比');
      this.shareButton.textContent = '已复制 ✓';
      window.setTimeout(() => {
        this.shareButton.textContent = '复制战绩';
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

  private renderEventStrip(): void {
    const warning = this.challenge.events.find((event) => event.triggerTurn === this.state.turn + 1);
    const active = this.challenge.events.find((event) => {
      if (event.kind === 'meeting') return false;
      return this.state.turn >= event.triggerTurn && this.state.turn < event.triggerTurn + event.duration;
    });
    if (warning) {
      this.eventStrip.className = 'event-strip warning';
      this.eventStrip.textContent = `⚠ 下一回合：${eventName(warning)}`;
    } else if (active) {
      this.eventStrip.className = 'event-strip active';
      this.eventStrip.textContent = `● 事件生效中：${eventName(active)}`;
    } else {
      const upcoming = this.challenge.events.find((event) => event.triggerTurn > this.state.turn);
      this.eventStrip.className = 'event-strip';
      this.eventStrip.textContent = upcoming
        ? `办公室暂时平静 · 第 ${upcoming.triggerTurn} 回合附近可能有事`
        : '意外已经结束 · 抓紧去电梯';
    }
  }

  private render(): void {
    renderBoard(this.canvas, this.challenge, this.state, this.playerFacing);
    this.dateLabel.textContent = `${formatChineseDate(this.challenge.dateKey)} · #${String(this.challenge.seed).slice(-4)}`;
    this.turnValue.textContent = String(Math.max(0, this.challenge.turnLimit - this.state.turn));
    this.suspicionValue.textContent = `${'●'.repeat(this.state.suspicion)}${'○'.repeat(2 - this.state.suspicion)}`;
    this.suspicionValue.setAttribute('aria-label', `怀疑值 ${this.state.suspicion}/2`);
    this.cardValue.textContent = this.state.hasCard ? '已拿到 ✓' : '未拿到';
    this.cardValue.classList.toggle('complete', this.state.hasCard);
    const best = this.save.bestByDate[this.challenge.dateKey];
    this.bestValue.textContent = best ? `${best.turns} 回合` : '--';
    this.muteButton.textContent = this.save.muted ? '声音：关' : '声音：开';
    this.muteButton.setAttribute('aria-pressed', String(this.save.muted));
    this.renderEventStrip();
  }
}

new GameApp(getShanghaiDateKey());
