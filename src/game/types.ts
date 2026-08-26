export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 8;
export const TURN_LIMIT = 30;
export const RULES_VERSION = 1;

export interface Point {
  x: number;
  y: number;
}

export type Direction = 'up' | 'right' | 'down' | 'left';
export type GameAction = Direction | 'wait';
export type GameStatus = 'playing' | 'won' | 'lost';
export type EventKind = 'meeting' | 'blackout' | 'cleaning-cart';
export type GameMode = 'daily' | 'campaign' | 'boss-campaign';
export type BossAction = 'advance' | 'hold' | 'reverse';
export type BossGameStatus = 'playing' | 'boss-won' | 'employee-escaped';

interface ChallengeEventBase {
  id: string;
  kind: EventKind;
  triggerTurn: number;
}

export interface MeetingEvent extends ChallengeEventBase {
  kind: 'meeting';
}

export interface BlackoutEvent extends ChallengeEventBase {
  kind: 'blackout';
  duration: number;
}

export interface CleaningCartEvent extends ChallengeEventBase {
  kind: 'cleaning-cart';
  duration: number;
  target: Point;
}

export type ChallengeEvent = MeetingEvent | BlackoutEvent | CleaningCartEvent;

export interface ChallengeRules {
  schemaVersion: number;
  seed: number;
  layoutId: string;
  width: number;
  height: number;
  tiles: string[];
  start: Point;
  exit: Point;
  card: Point;
  bossPath: Point[];
  bossStartIndex: number;
  bossStartDirection: 1 | -1;
  events: ChallengeEvent[];
  turnLimit: number;
}

export interface DailyChallengeDefinition extends ChallengeRules {
  mode: 'daily';
  challengeId: string;
  dateKey: string;
}

export interface CampaignChallengeDefinition extends ChallengeRules {
  mode: 'campaign';
  challengeId: string;
  levelId: string;
  levelNumber: number;
  title: string;
  description: string;
}

export type ChallengeDefinition = DailyChallengeDefinition | CampaignChallengeDefinition;

export interface CampaignLevel {
  id: string;
  number: number;
  title: string;
  description: string;
  challenge: CampaignChallengeDefinition;
}

export interface CampaignProgress {
  completedLevelIds: string[];
}

export interface BossActionLimits {
  holds: number;
  reversals: number;
  reverseCooldownTurns: number;
}

export interface BossChallengeDefinition extends ChallengeRules {
  mode: 'boss-campaign';
  challengeId: string;
  levelId: string;
  levelNumber: number;
  title: string;
  description: string;
  actionLimits: BossActionLimits;
  employeeActionPriority: GameAction[];
}

export interface BossCampaignLevel {
  id: string;
  number: number;
  title: string;
  description: string;
  challenge: BossChallengeDefinition;
}

export interface BossCampaignProgress {
  completedLevelIds: string[];
}

export interface BossGameState {
  employee: Point;
  employeeFacing: Direction;
  bossIndex: number;
  bossDirection: 1 | -1;
  turn: number;
  catches: number;
  employeeHasCard: boolean;
  holdsRemaining: number;
  reversalsRemaining: number;
  reverseCooldown: number;
  status: BossGameStatus;
  winReason?: 'caught' | 'timeout';
}

export type BossGameEffect =
  | { kind: 'boss-moved' }
  | { kind: 'boss-held' }
  | { kind: 'boss-reversed' }
  | { kind: 'blocked'; reason: 'no-holds' | 'no-reversals' | 'reverse-cooldown' | 'finished' }
  | { kind: 'employee-moved' }
  | { kind: 'employee-waited' }
  | { kind: 'employee-card-picked' }
  | { kind: 'event-started'; event: ChallengeEvent }
  | { kind: 'employee-caught'; catches: number }
  | { kind: 'boss-won'; reason: 'caught' | 'timeout' }
  | { kind: 'employee-escaped' };

export interface BossTransitionResult {
  state: BossGameState;
  effects: BossGameEffect[];
  employeeAction: GameAction;
}

export interface GameState {
  player: Point;
  bossIndex: number;
  bossDirection: 1 | -1;
  turn: number;
  suspicion: number;
  hasCard: boolean;
  status: GameStatus;
  lossReason?: 'caught' | 'timeout';
}

export interface RunResult {
  dateKey: string;
  turns: number;
  suspicion: number;
  completedAt: string;
}

export type GameEffect =
  | { kind: 'moved' }
  | { kind: 'waited' }
  | { kind: 'blocked' }
  | { kind: 'card-picked' }
  | { kind: 'event-started'; event: ChallengeEvent }
  | { kind: 'detected'; suspicion: number }
  | { kind: 'won' }
  | { kind: 'lost'; reason: 'caught' | 'timeout' };

export interface TransitionResult {
  state: GameState;
  effects: GameEffect[];
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}
