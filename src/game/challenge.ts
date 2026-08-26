import { LAYOUTS, type LayoutTemplate } from './layouts';
import { createRandom, hashString, type RandomSource } from './prng';
import { findSolution } from './solver';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  RULES_VERSION,
  TURN_LIMIT,
  type ChallengeDefinition,
  type ChallengeEvent,
  type EventKind,
  type Point,
} from './types';
import { pointKey, pointsEqual } from './types';

const eventKinds: EventKind[] = ['meeting', 'blackout', 'cleaning-cart'];

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function tileAt(template: LayoutTemplate, point: Point): string {
  return template.tiles[point.y]?.[point.x] ?? '#';
}

function makeEvents(
  random: RandomSource,
  template: LayoutTemplate,
  occupied: Point[],
): ChallengeEvent[] {
  const selectedKinds = random.shuffle(eventKinds).slice(0, 2);
  const turns = [random.int(7, 9), random.int(16, 18)];
  const bossPathKeys = new Set(template.bossPath.map(pointKey));
  const cartCandidates = template.carts.filter(
    (point) =>
      tileAt(template, point) === '.' &&
      !occupied.some((candidate) => pointsEqual(candidate, point)) &&
      !bossPathKeys.has(pointKey(point)),
  );
  const cartTarget = random.pick(cartCandidates);

  return selectedKinds
    .map((kind, index): ChallengeEvent => {
      const triggerTurn = turns[index] as number;
      if (kind === 'meeting') {
        return { id: `meeting-${triggerTurn}`, kind, triggerTurn };
      }
      if (kind === 'blackout') {
        return { id: `blackout-${triggerTurn}`, kind, triggerTurn, duration: 4 };
      }
      return {
        id: `cleaning-cart-${triggerTurn}`,
        kind,
        triggerTurn,
        duration: 4,
        target: { ...cartTarget },
      };
    })
    .sort((a, b) => a.triggerTurn - b.triggerTurn);
}

function makeCandidate(dateKey: string, seed: number, attempt: number): ChallengeDefinition {
  const random = createRandom(hashString(`${seed}:${attempt}`));
  const template = random.pick(LAYOUTS);
  const start = { ...random.pick(template.starts.filter((point) => tileAt(template, point) === '.')) };
  const exit = { ...random.pick(template.exits.filter((point) => !pointsEqual(point, start))) };
  const preferredCards = random.shuffle(
    template.cards.filter(
      (point) =>
        tileAt(template, point) === '.' &&
        !pointsEqual(point, start) &&
        !pointsEqual(point, exit) &&
        manhattan(start, point) >= 4 &&
        manhattan(point, exit) >= 5,
    ),
  );
  const card = { ...random.pick(preferredCards) };
  const unavailable = [start, exit, card];
  const eligibleBossStarts = template.bossPath
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => !unavailable.some((candidate) => pointsEqual(point, candidate)));
  const bossStartIndex = random.pick(eligibleBossStarts).index;
  const bossStartDirection = random.next() < 0.5 ? -1 : 1;

  return {
    schemaVersion: RULES_VERSION,
    dateKey,
    seed,
    layoutId: template.id,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    tiles: [...template.tiles],
    start,
    exit,
    card,
    bossPath: template.bossPath.map((point) => ({ ...point })),
    bossStartIndex,
    bossStartDirection,
    events: makeEvents(random, template, unavailable),
    turnLimit: TURN_LIMIT,
  };
}

export function generateDailyChallenge(dateKey: string): ChallengeDefinition {
  const seed = hashString(`${RULES_VERSION}:${dateKey}`);
  let easiestCandidate: { challenge: ChallengeDefinition; length: number } | null = null;

  for (let attempt = 0; attempt < 96; attempt += 1) {
    const challenge = makeCandidate(dateKey, seed, attempt);
    const solution = findSolution(challenge, 0);
    if (!solution) {
      continue;
    }
    if (!easiestCandidate || solution.length > easiestCandidate.length) {
      easiestCandidate = { challenge, length: solution.length };
    }
    if (solution.length >= 10 && solution.length <= challenge.turnLimit) {
      return challenge;
    }
  }

  if (easiestCandidate) {
    return easiestCandidate.challenge;
  }
  throw new Error(`Unable to build a solvable daily challenge for ${dateKey}.`);
}
