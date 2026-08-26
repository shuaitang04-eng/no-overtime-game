import type {
  BossAction,
  BossChallengeDefinition,
  BossGameEffect,
  BossGameState,
  BossTransitionResult,
  Direction,
  GameAction,
  Point,
} from './types';
import { pointKey, pointsEqual } from './types';
import {
  advanceBossIndex,
  getActiveCleaningCart,
  getBossPoint,
  getBossVision,
  isInside,
  isStaticBlocker,
} from './vision';

const actionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function createInitialBossState(challenge: BossChallengeDefinition): BossGameState {
  return {
    employee: { ...challenge.start },
    employeeFacing: 'down',
    bossIndex: challenge.bossStartIndex,
    bossDirection: challenge.bossStartDirection,
    turn: 0,
    catches: 0,
    employeeHasCard: false,
    holdsRemaining: challenge.actionLimits.holds,
    reversalsRemaining: challenge.actionLimits.reversals,
    reverseCooldown: 0,
    status: 'playing',
  };
}

function employeeGoal(challenge: BossChallengeDefinition, state: BossGameState): Point {
  return state.employeeHasCard ? challenge.exit : challenge.card;
}

function movePoint(point: Point, action: GameAction): Point {
  if (action === 'wait') return { ...point };
  const vector = actionVectors[action];
  return { x: point.x + vector.x, y: point.y + vector.y };
}

function isEmployeeWalkable(
  challenge: BossChallengeDefinition,
  point: Point,
  turn: number,
): boolean {
  if (!isInside(challenge, point) || isStaticBlocker(challenge, point)) return false;
  const cart = getActiveCleaningCart(challenge, turn);
  return !cart || !pointsEqual(cart, point);
}

function distanceToGoal(
  challenge: BossChallengeDefinition,
  from: Point,
  goal: Point,
  state: BossGameState,
): number {
  if (pointsEqual(from, goal)) return 0;
  const blockedBoss = getBossPoint(challenge, state.bossIndex);
  const queue: Array<{ point: Point; distance: number }> = [{ point: from, distance: 0 }];
  const visited = new Set<string>([pointKey(from)]);
  let cursor = 0;

  while (cursor < queue.length) {
    const node = queue[cursor]!;
    cursor += 1;
    for (const direction of ['up', 'right', 'down', 'left'] as const) {
      const next = movePoint(node.point, direction);
      const key = pointKey(next);
      if (
        visited.has(key) ||
        !isEmployeeWalkable(challenge, next, state.turn) ||
        (pointsEqual(next, blockedBoss) && !pointsEqual(next, goal))
      ) {
        continue;
      }
      if (pointsEqual(next, goal)) return node.distance + 1;
      visited.add(key);
      queue.push({ point: next, distance: node.distance + 1 });
    }
  }
  return Number.POSITIVE_INFINITY;
}

export function getEmployeeGoalKind(state: BossGameState): 'card' | 'exit' {
  return state.employeeHasCard ? 'exit' : 'card';
}

export function chooseEmployeeAction(
  challenge: BossChallengeDefinition,
  state: BossGameState,
): GameAction {
  const goal = employeeGoal(challenge, state);
  const currentVision = new Set(
    getBossVision(
      challenge,
      state.bossIndex,
      state.bossDirection,
      state.turn,
    ).map(pointKey),
  );
  const boss = getBossPoint(challenge, state.bossIndex);

  const candidates = challenge.employeeActionPriority
    .map((action, priority) => ({
      action,
      point: movePoint(state.employee, action),
      priority,
    }))
    .filter(
      ({ action, point }) =>
        action === 'wait' || isEmployeeWalkable(challenge, point, state.turn),
    )
    .map((candidate) => ({
      ...candidate,
      risk:
        currentVision.has(pointKey(candidate.point)) || pointsEqual(candidate.point, boss)
          ? 1
          : 0,
      distance: distanceToGoal(challenge, candidate.point, goal, state),
    }))
    .sort(
      (left, right) =>
        left.risk - right.risk ||
        left.distance - right.distance ||
        left.priority - right.priority,
    );

  return candidates[0]?.action ?? 'wait';
}

function blockedReason(
  state: BossGameState,
  action: BossAction,
): Extract<BossGameEffect, { kind: 'blocked' }>['reason'] | null {
  if (action === 'hold' && state.holdsRemaining <= 0) return 'no-holds';
  if (action === 'reverse' && state.reversalsRemaining <= 0) return 'no-reversals';
  if (action === 'reverse' && state.reverseCooldown > 0) return 'reverse-cooldown';
  return null;
}

function includesPoint(points: Point[], target: Point): boolean {
  const targetKey = pointKey(target);
  return points.some((point) => pointKey(point) === targetKey);
}

export function applyBossAction(
  challenge: BossChallengeDefinition,
  currentState: BossGameState,
  action: BossAction,
): BossTransitionResult {
  if (currentState.status !== 'playing') {
    return {
      state: currentState,
      effects: [{ kind: 'blocked', reason: 'finished' }],
      employeeAction: 'wait',
    };
  }
  const reason = blockedReason(currentState, action);
  if (reason) {
    return {
      state: currentState,
      effects: [{ kind: 'blocked', reason }],
      employeeAction: 'wait',
    };
  }

  const employeeAction = chooseEmployeeAction(challenge, currentState);
  const employeeFrom = { ...currentState.employee };
  const employeeTo = movePoint(employeeFrom, employeeAction);
  const bossFrom = getBossPoint(challenge, currentState.bossIndex);
  const effects: BossGameEffect[] = [];
  const state: BossGameState = {
    ...currentState,
    employee: employeeTo,
    turn: currentState.turn + 1,
    reverseCooldown:
      action === 'reverse'
        ? challenge.actionLimits.reverseCooldownTurns
        : Math.max(0, currentState.reverseCooldown - 1),
  };

  if (employeeAction === 'wait') {
    effects.push({ kind: 'employee-waited' });
  } else {
    state.employeeFacing = employeeAction;
    effects.push({ kind: 'employee-moved' });
  }

  if (action === 'hold') {
    state.holdsRemaining -= 1;
    effects.push({ kind: 'boss-held' });
  } else {
    if (action === 'reverse') {
      state.bossDirection = (state.bossDirection * -1) as 1 | -1;
      state.reversalsRemaining -= 1;
      effects.push({ kind: 'boss-reversed' });
    } else {
      effects.push({ kind: 'boss-moved' });
    }
    state.bossIndex = advanceBossIndex(
      challenge,
      state.bossIndex,
      state.bossDirection,
    );
  }

  for (const event of challenge.events) {
    if (event.triggerTurn === state.turn) effects.push({ kind: 'event-started', event });
  }

  const bossTo = getBossPoint(challenge, state.bossIndex);
  const crossed = pointsEqual(employeeTo, bossFrom) && pointsEqual(bossTo, employeeFrom);
  const caught =
    pointsEqual(employeeTo, bossTo) ||
    crossed ||
    includesPoint(
      getBossVision(
        challenge,
        state.bossIndex,
        state.bossDirection,
        state.turn,
      ),
      employeeTo,
    );

  if (caught) {
    state.catches += 1;
    effects.push({ kind: 'employee-caught', catches: state.catches });
    if (state.catches >= 2) {
      state.status = 'boss-won';
      state.winReason = 'caught';
      effects.push({ kind: 'boss-won', reason: 'caught' });
      return { state, effects, employeeAction };
    }
    state.employee = { ...challenge.start };
    state.employeeFacing = 'down';
    state.employeeHasCard = false;
  } else {
    if (!state.employeeHasCard && pointsEqual(state.employee, challenge.card)) {
      state.employeeHasCard = true;
      effects.push({ kind: 'employee-card-picked' });
    }
    if (state.employeeHasCard && pointsEqual(state.employee, challenge.exit)) {
      state.status = 'employee-escaped';
      effects.push({ kind: 'employee-escaped' });
      return { state, effects, employeeAction };
    }
  }

  if (state.turn >= challenge.turnLimit) {
    state.status = 'boss-won';
    state.winReason = 'timeout';
    effects.push({ kind: 'boss-won', reason: 'timeout' });
  }

  return { state, effects, employeeAction };
}
