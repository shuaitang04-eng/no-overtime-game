import type {
  CampaignChallengeDefinition,
  CampaignLevel,
  CampaignProgress,
  Point,
} from './types';
import { BOARD_HEIGHT, BOARD_WIDTH, RULES_VERSION, TURN_LIMIT } from './types';

const perimeterPath: Point[] = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 3, y: 1 },
  { x: 4, y: 1 },
  { x: 5, y: 1 },
  { x: 6, y: 1 },
  { x: 7, y: 1 },
  { x: 8, y: 1 },
  { x: 8, y: 2 },
  { x: 8, y: 3 },
  { x: 8, y: 4 },
  { x: 8, y: 5 },
  { x: 8, y: 6 },
  { x: 7, y: 6 },
  { x: 6, y: 6 },
  { x: 5, y: 6 },
  { x: 4, y: 6 },
  { x: 3, y: 6 },
  { x: 2, y: 6 },
  { x: 1, y: 6 },
  { x: 1, y: 5 },
  { x: 1, y: 4 },
  { x: 1, y: 3 },
  { x: 1, y: 2 },
];

const officeLayouts = {
  open: [
    '##########',
    '#........#',
    '#.DD..DD.#',
    '#........#',
    '#..P..P..#',
    '#.DD..DD.#',
    '#........#',
    '##########',
  ],
  cubicles: [
    '##########',
    '#........#',
    '#.D.D.D..#',
    '#.D.D.D..#',
    '#..D.D.D.#',
    '#..D.D.D.#',
    '#........#',
    '##########',
  ],
  corners: [
    '##########',
    '#........#',
    '#..DDD...#',
    '#..D.....#',
    '#.....D..#',
    '#...DDD..#',
    '#........#',
    '##########',
  ],
  diagonal: [
    '##########',
    '#........#',
    '#.DD.....#',
    '#....DD..#',
    '#..DD....#',
    '#.....DD.#',
    '#........#',
    '##########',
  ],
  finale: [
    '##########',
    '#........#',
    '#.D..DD..#',
    '#.D.P....#',
    '#....P.D.#',
    '#..DD..D.#',
    '#........#',
    '##########',
  ],
} as const;

interface LevelInput {
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
  events: CampaignChallengeDefinition['events'];
}

function makeLevel(input: LevelInput): CampaignLevel {
  const challenge: CampaignChallengeDefinition = {
    schemaVersion: RULES_VERSION,
    mode: 'campaign',
    challengeId: `campaign:${input.id}`,
    levelId: input.id,
    levelNumber: input.number,
    title: input.title,
    description: input.description,
    seed: input.number,
    layoutId: input.layoutId,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    tiles: [...input.tiles],
    start: { ...input.start },
    card: { ...input.card },
    exit: { ...input.exit },
    bossPath: perimeterPath.map((point) => ({ ...point })),
    bossStartIndex: input.bossStartIndex,
    bossStartDirection: input.bossStartDirection,
    events: input.events.map((event) => ({ ...event })),
    turnLimit: TURN_LIMIT,
  };
  return {
    id: input.id,
    number: input.number,
    title: input.title,
    description: input.description,
    challenge,
  };
}

export const CAMPAIGN_LEVELS: CampaignLevel[] = [
  makeLevel({
    id: 'rookie-drill',
    number: 1,
    title: '新人演习',
    description: '先拿门禁卡，再绕开老板进入电梯。',
    layoutId: 'campaign-open',
    tiles: officeLayouts.open,
    start: { x: 4, y: 3 },
    card: { x: 1, y: 1 },
    exit: { x: 8, y: 1 },
    bossStartIndex: 12,
    bossStartDirection: 1,
    events: [],
  }),
  makeLevel({
    id: 'cubicle-maze',
    number: 2,
    title: '隔断迷阵',
    description: '利用隔断挡住视线，必要时原地等待。',
    layoutId: 'campaign-cubicles',
    tiles: officeLayouts.cubicles,
    start: { x: 3, y: 3 },
    card: { x: 7, y: 1 },
    exit: { x: 1, y: 6 },
    bossStartIndex: 1,
    bossStartDirection: 1,
    events: [],
  }),
  makeLevel({
    id: 'cleaning-shift',
    number: 3,
    title: '清洁进行中',
    description: '清洁车会封住捷径，提前规划备用路线。',
    layoutId: 'campaign-corners',
    tiles: officeLayouts.corners,
    start: { x: 4, y: 4 },
    card: { x: 1, y: 1 },
    exit: { x: 8, y: 1 },
    bossStartIndex: 18,
    bossStartDirection: -1,
    events: [
      {
        id: 'campaign-cart-9',
        kind: 'cleaning-cart',
        triggerTurn: 9,
        duration: 5,
        target: { x: 5, y: 3 },
      },
    ],
  }),
  makeLevel({
    id: 'sudden-meeting',
    number: 4,
    title: '临时会议',
    description: '老板会突然掉头，别只盯着旧巡逻方向。',
    layoutId: 'campaign-diagonal',
    tiles: officeLayouts.diagonal,
    start: { x: 5, y: 5 },
    card: { x: 1, y: 1 },
    exit: { x: 8, y: 6 },
    bossStartIndex: 1,
    bossStartDirection: -1,
    events: [{ id: 'campaign-meeting-7', kind: 'meeting', triggerTurn: 7 }],
  }),
  makeLevel({
    id: 'last-minute',
    number: 5,
    title: '最后一分钟',
    description: '三种办公室意外全部登场，抓住停电窗口开溜。',
    layoutId: 'campaign-finale',
    tiles: officeLayouts.finale,
    start: { x: 4, y: 4 },
    card: { x: 8, y: 6 },
    exit: { x: 1, y: 1 },
    bossStartIndex: 6,
    bossStartDirection: 1,
    events: [
      {
        id: 'campaign-cart-6',
        kind: 'cleaning-cart',
        triggerTurn: 6,
        duration: 4,
        target: { x: 6, y: 4 },
      },
      { id: 'campaign-meeting-11', kind: 'meeting', triggerTurn: 11 },
      { id: 'campaign-blackout-16', kind: 'blackout', triggerTurn: 16, duration: 4 },
    ],
  }),
];

export function isCampaignLevelUnlocked(
  level: CampaignLevel,
  progress: CampaignProgress,
): boolean {
  const index = CAMPAIGN_LEVELS.findIndex((candidate) => candidate.id === level.id);
  if (index <= 0) return index === 0;
  return CAMPAIGN_LEVELS.slice(0, index).every((candidate) =>
    progress.completedLevelIds.includes(candidate.id),
  );
}

export function getCampaignLevel(levelId: string): CampaignLevel | undefined {
  return CAMPAIGN_LEVELS.find((level) => level.id === levelId);
}

export function getNextCampaignLevel(levelId: string): CampaignLevel | undefined {
  const index = CAMPAIGN_LEVELS.findIndex((level) => level.id === levelId);
  return index >= 0 ? CAMPAIGN_LEVELS[index + 1] : undefined;
}
