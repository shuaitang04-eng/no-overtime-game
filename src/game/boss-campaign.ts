import type {
  BossCampaignLevel,
  BossCampaignProgress,
  BossChallengeDefinition,
  GameAction,
  Point,
} from './types';
import { BOARD_HEIGHT, BOARD_WIDTH, RULES_VERSION, TURN_LIMIT } from './types';

function rectanglePath(left: number, top: number, right: number, bottom: number): Point[] {
  const path: Point[] = [];
  for (let x = left; x <= right; x += 1) path.push({ x, y: top });
  for (let y = top + 1; y <= bottom; y += 1) path.push({ x: right, y });
  for (let x = right - 1; x >= left; x -= 1) path.push({ x, y: bottom });
  for (let y = bottom - 1; y > top; y -= 1) path.push({ x: left, y });
  return path;
}

const patrolPath = rectanglePath(1, 1, 8, 6);

const bossLayouts = {
  routine: [
    '##########',
    '#........#',
    '#..D.D...#',
    '#........#',
    '#...P.D..#',
    '#........#',
    '#........#',
    '##########',
  ],
  blindSpots: [
    '##########',
    '#........#',
    '#.DD..D..#',
    '#..D..D..#',
    '#..D.....#',
    '#....DD..#',
    '#........#',
    '##########',
  ],
  detour: [
    '##########',
    '#........#',
    '#..DDD...#',
    '#....D...#',
    '#.D......#',
    '#.D..DD..#',
    '#........#',
    '##########',
  ],
  blackout: [
    '##########',
    '#........#',
    '#.D...D..#',
    '#...D....#',
    '#....D...#',
    '#..D...D.#',
    '#........#',
    '##########',
  ],
  finalRound: [
    '##########',
    '#........#',
    '#.DD...D.#',
    '#....P...#',
    '#..P...D.#',
    '#.D...DD.#',
    '#........#',
    '##########',
  ],
} as const;

interface BossLevelInput {
  id: string;
  number: number;
  title: string;
  description: string;
  layoutId: string;
  tiles: readonly string[];
  start: Point;
  card: Point;
  exit: Point;
  bossStartIndex: number;
  bossStartDirection: 1 | -1;
  events: BossChallengeDefinition['events'];
  employeeActionPriority: GameAction[];
}

function makeBossLevel(input: BossLevelInput): BossCampaignLevel {
  const challenge: BossChallengeDefinition = {
    schemaVersion: RULES_VERSION,
    mode: 'boss-campaign',
    challengeId: `boss-campaign:${input.id}`,
    levelId: input.id,
    levelNumber: input.number,
    title: input.title,
    description: input.description,
    seed: 100 + input.number,
    layoutId: input.layoutId,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    tiles: [...input.tiles],
    start: { ...input.start },
    card: { ...input.card },
    exit: { ...input.exit },
    bossPath: patrolPath.map((point) => ({ ...point })),
    bossStartIndex: input.bossStartIndex,
    bossStartDirection: input.bossStartDirection,
    events: input.events.map((event) => ({ ...event })),
    turnLimit: TURN_LIMIT,
    actionLimits: { holds: 2, reversals: 2, reverseCooldownTurns: 2 },
    employeeActionPriority: [...input.employeeActionPriority],
  };
  return {
    id: input.id,
    number: input.number,
    title: input.title,
    description: input.description,
    challenge,
  };
}

export const BOSS_CAMPAIGN_LEVELS: BossCampaignLevel[] = [
  makeBossLevel({
    id: 'routine-inspection',
    number: 1,
    title: '例行巡查',
    description: '掌握继续、停留和掉头，在员工溜走前抓到两次。',
    layoutId: 'boss-routine',
    tiles: bossLayouts.routine,
    start: { x: 4, y: 3 },
    card: { x: 1, y: 1 },
    exit: { x: 8, y: 6 },
    bossStartIndex: 8,
    bossStartDirection: 1,
    events: [],
    employeeActionPriority: ['up', 'left', 'right', 'down', 'wait'],
  }),
  makeBossLevel({
    id: 'partition-blind-spots',
    number: 2,
    title: '隔断盲区',
    description: '从目标区域判断员工路线，利用隔断出口完成拦截。',
    layoutId: 'boss-blind-spots',
    tiles: bossLayouts.blindSpots,
    start: { x: 4, y: 4 },
    card: { x: 7, y: 1 },
    exit: { x: 1, y: 6 },
    bossStartIndex: 19,
    bossStartDirection: 1,
    events: [],
    employeeActionPriority: ['up', 'right', 'left', 'down', 'wait'],
  }),
  makeBossLevel({
    id: 'cleaning-detour',
    number: 3,
    title: '保洁改道',
    description: '清洁车会临时改变员工路线，提前去新的必经点。',
    layoutId: 'boss-cleaning-detour',
    tiles: bossLayouts.detour,
    start: { x: 4, y: 4 },
    card: { x: 1, y: 1 },
    exit: { x: 8, y: 1 },
    bossStartIndex: 12,
    bossStartDirection: 1,
    events: [
      {
        id: 'boss-cart-7',
        kind: 'cleaning-cart',
        triggerTurn: 7,
        duration: 5,
        target: { x: 4, y: 4 },
      },
    ],
    employeeActionPriority: ['left', 'up', 'right', 'down', 'wait'],
  }),
  makeBossLevel({
    id: 'blackout-watch',
    number: 4,
    title: '停电时刻',
    description: '停电会缩短视野，把有限的掉头留给关键窗口。',
    layoutId: 'boss-blackout-watch',
    tiles: bossLayouts.blackout,
    start: { x: 4, y: 4 },
    card: { x: 8, y: 6 },
    exit: { x: 1, y: 1 },
    bossStartIndex: 2,
    bossStartDirection: -1,
    events: [
      { id: 'boss-blackout-8', kind: 'blackout', triggerTurn: 8, duration: 5 },
    ],
    employeeActionPriority: ['down', 'right', 'left', 'up', 'wait'],
  }),
  makeBossLevel({
    id: 'final-round',
    number: 5,
    title: '最后一轮',
    description: '隔断、清洁车和两段停电同时出现，算准最后一次拦截。',
    layoutId: 'boss-final-round',
    tiles: bossLayouts.finalRound,
    start: { x: 4, y: 4 },
    card: { x: 8, y: 6 },
    exit: { x: 1, y: 1 },
    bossStartIndex: 2,
    bossStartDirection: -1,
    events: [
      {
        id: 'boss-cart-6',
        kind: 'cleaning-cart',
        triggerTurn: 6,
        duration: 5,
        target: { x: 6, y: 4 },
      },
      { id: 'boss-blackout-11', kind: 'blackout', triggerTurn: 11, duration: 4 },
      { id: 'boss-blackout-21', kind: 'blackout', triggerTurn: 21, duration: 4 },
    ],
    employeeActionPriority: ['right', 'down', 'left', 'up', 'wait'],
  }),
];

export function isBossCampaignLevelUnlocked(
  level: BossCampaignLevel,
  progress: BossCampaignProgress,
): boolean {
  const index = BOSS_CAMPAIGN_LEVELS.findIndex((candidate) => candidate.id === level.id);
  if (index <= 0) return index === 0;
  return BOSS_CAMPAIGN_LEVELS.slice(0, index).every((candidate) =>
    progress.completedLevelIds.includes(candidate.id),
  );
}

export function getBossCampaignLevel(levelId: string): BossCampaignLevel | undefined {
  return BOSS_CAMPAIGN_LEVELS.find((level) => level.id === levelId);
}

export function getNextBossCampaignLevel(levelId: string): BossCampaignLevel | undefined {
  const index = BOSS_CAMPAIGN_LEVELS.findIndex((level) => level.id === levelId);
  return index >= 0 ? BOSS_CAMPAIGN_LEVELS[index + 1] : undefined;
}
