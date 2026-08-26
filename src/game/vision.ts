import type { ChallengeDefinition, Direction, GameState, Point } from './types';
import { pointKey } from './types';

const directionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function getTile(challenge: ChallengeDefinition, point: Point): string {
  return challenge.tiles[point.y]?.[point.x] ?? '#';
}

export function isInside(challenge: ChallengeDefinition, point: Point): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < challenge.width && point.y < challenge.height;
}

export function isStaticBlocker(challenge: ChallengeDefinition, point: Point): boolean {
  return getTile(challenge, point) !== '.';
}

export function getActiveCleaningCart(challenge: ChallengeDefinition, turn: number): Point | null {
  const event = challenge.events.find(
    (candidate) =>
      candidate.kind === 'cleaning-cart' &&
      turn >= candidate.triggerTurn &&
      turn < candidate.triggerTurn + candidate.duration,
  );
  return event?.kind === 'cleaning-cart' ? event.target : null;
}

export function getVisionRange(challenge: ChallengeDefinition, turn: number): number {
  const blackout = challenge.events.some(
    (event) =>
      event.kind === 'blackout' &&
      turn >= event.triggerTurn &&
      turn < event.triggerTurn + event.duration,
  );
  return blackout ? 1 : 3;
}

export function getBossPoint(challenge: ChallengeDefinition, bossIndex: number): Point {
  const point = challenge.bossPath[bossIndex];
  if (!point) {
    throw new Error(`Invalid boss path index: ${bossIndex}`);
  }
  return point;
}

export function advanceBossIndex(
  challenge: ChallengeDefinition,
  bossIndex: number,
  direction: 1 | -1,
): number {
  const length = challenge.bossPath.length;
  return (bossIndex + direction + length) % length;
}

export function getBossFacing(
  challenge: ChallengeDefinition,
  bossIndex: number,
  direction: 1 | -1,
): Direction {
  const current = getBossPoint(challenge, bossIndex);
  const next = getBossPoint(challenge, advanceBossIndex(challenge, bossIndex, direction));
  const deltaX = next.x - current.x;
  const deltaY = next.y - current.y;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? 'right' : 'left';
  }
  return deltaY > 0 ? 'down' : 'up';
}

function linePoints(from: Point, to: Point): Point[] {
  const points: Point[] = [];
  let x = from.x;
  let y = from.y;
  const deltaX = Math.abs(to.x - from.x);
  const stepX = from.x < to.x ? 1 : -1;
  const deltaY = -Math.abs(to.y - from.y);
  const stepY = from.y < to.y ? 1 : -1;
  let error = deltaX + deltaY;

  while (x !== to.x || y !== to.y) {
    const doubled = 2 * error;
    if (doubled >= deltaY) {
      error += deltaY;
      x += stepX;
    }
    if (doubled <= deltaX) {
      error += deltaX;
      y += stepY;
    }
    points.push({ x, y });
  }
  return points;
}

function hasLineOfSight(
  challenge: ChallengeDefinition,
  from: Point,
  target: Point,
  turn: number,
): boolean {
  const cart = getActiveCleaningCart(challenge, turn);
  const points = linePoints(from, target);
  return points.every((point, index) => {
    if (index === points.length - 1) {
      return true;
    }
    return !isStaticBlocker(challenge, point) && pointKey(point) !== (cart ? pointKey(cart) : '');
  });
}

export function getBossVision(
  challenge: ChallengeDefinition,
  bossIndex: number,
  direction: 1 | -1,
  turn: number,
): Point[] {
  const origin = getBossPoint(challenge, bossIndex);
  const facing = getBossFacing(challenge, bossIndex, direction);
  const forward = directionVectors[facing];
  const lateral = { x: -forward.y, y: forward.x };
  const range = getVisionRange(challenge, turn);
  const cells = new Map<string, Point>();

  for (let distance = 1; distance <= range; distance += 1) {
    const spread = Math.floor(distance / 2);
    for (let offset = -spread; offset <= spread; offset += 1) {
      const target = {
        x: origin.x + forward.x * distance + lateral.x * offset,
        y: origin.y + forward.y * distance + lateral.y * offset,
      };
      if (!isInside(challenge, target) || !hasLineOfSight(challenge, origin, target, turn)) {
        continue;
      }
      cells.set(pointKey(target), target);
    }
  }
  return [...cells.values()];
}

export function getCurrentVision(challenge: ChallengeDefinition, state: GameState): Point[] {
  return getBossVision(challenge, state.bossIndex, state.bossDirection, state.turn);
}

export function getNextBossState(
  challenge: ChallengeDefinition,
  state: GameState,
): Pick<GameState, 'bossIndex' | 'bossDirection' | 'turn'> {
  const nextTurn = state.turn + 1;
  const meetingStarts = challenge.events.some(
    (event) => event.kind === 'meeting' && event.triggerTurn === nextTurn,
  );
  const bossDirection = meetingStarts
    ? ((state.bossDirection * -1) as 1 | -1)
    : state.bossDirection;
  return {
    bossIndex: advanceBossIndex(challenge, state.bossIndex, bossDirection),
    bossDirection,
    turn: nextTurn,
  };
}

export function getNextVision(challenge: ChallengeDefinition, state: GameState): Point[] {
  const next = getNextBossState(challenge, state);
  return getBossVision(challenge, next.bossIndex, next.bossDirection, next.turn);
}
