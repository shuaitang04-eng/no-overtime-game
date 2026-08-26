import type {
  ChallengeDefinition,
  GameAction,
  GameEffect,
  GameState,
  Point,
  TransitionResult,
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

const actionVectors: Record<Exclude<GameAction, 'wait'>, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function createInitialState(challenge: ChallengeDefinition): GameState {
  return {
    player: { ...challenge.start },
    bossIndex: challenge.bossStartIndex,
    bossDirection: challenge.bossStartDirection,
    turn: 0,
    suspicion: 0,
    hasCard: false,
    status: 'playing',
  };
}

function includesPoint(points: Point[], target: Point): boolean {
  const key = pointKey(target);
  return points.some((point) => pointKey(point) === key);
}

function isDetected(challenge: ChallengeDefinition, state: GameState): boolean {
  const boss = getBossPoint(challenge, state.bossIndex);
  return (
    pointsEqual(boss, state.player) ||
    includesPoint(
      getBossVision(challenge, state.bossIndex, state.bossDirection, state.turn),
      state.player,
    )
  );
}

function lose(state: GameState, effects: GameEffect[], reason: 'caught' | 'timeout'): void {
  state.status = 'lost';
  state.lossReason = reason;
  effects.push({ kind: 'lost', reason });
}

function applyDetection(
  challenge: ChallengeDefinition,
  state: GameState,
  effects: GameEffect[],
): void {
  state.suspicion += 1;
  effects.push({ kind: 'detected', suspicion: state.suspicion });
  if (state.suspicion >= 2) {
    lose(state, effects, 'caught');
    return;
  }
  state.player = { ...challenge.start };
  state.hasCard = false;
}

function canEnter(challenge: ChallengeDefinition, state: GameState, point: Point): boolean {
  if (!isInside(challenge, point) || isStaticBlocker(challenge, point)) {
    return false;
  }
  const cart = getActiveCleaningCart(challenge, state.turn);
  if (cart && pointsEqual(cart, point)) {
    return false;
  }
  return !pointsEqual(getBossPoint(challenge, state.bossIndex), point);
}

export function applyAction(
  challenge: ChallengeDefinition,
  currentState: GameState,
  action: GameAction,
): TransitionResult {
  if (currentState.status !== 'playing') {
    return { state: currentState, effects: [{ kind: 'blocked' }] };
  }

  const state: GameState = {
    ...currentState,
    player: { ...currentState.player },
  };
  const effects: GameEffect[] = [];

  if (action === 'wait') {
    effects.push({ kind: 'waited' });
  } else {
    const vector = actionVectors[action];
    const target = { x: state.player.x + vector.x, y: state.player.y + vector.y };
    if (!canEnter(challenge, state, target)) {
      return { state: currentState, effects: [{ kind: 'blocked' }] };
    }
    state.player = target;
    effects.push({ kind: 'moved' });
  }

  state.turn += 1;
  let meetingStarts = false;
  for (const event of challenge.events) {
    if (event.triggerTurn === state.turn) {
      effects.push({ kind: 'event-started', event });
      if (event.kind === 'meeting') {
        meetingStarts = true;
      }
    }
  }

  if (!state.hasCard && pointsEqual(state.player, challenge.card)) {
    state.hasCard = true;
    effects.push({ kind: 'card-picked' });
  }

  const detectedBeforeBossMoves = isDetected(challenge, state);
  if (meetingStarts) {
    state.bossDirection = (state.bossDirection * -1) as 1 | -1;
  }

  if (detectedBeforeBossMoves) {
    applyDetection(challenge, state, effects);
  } else if (state.hasCard && pointsEqual(state.player, challenge.exit)) {
    state.status = 'won';
    effects.push({ kind: 'won' });
  } else {
    state.bossIndex = advanceBossIndex(challenge, state.bossIndex, state.bossDirection);
    if (isDetected(challenge, state)) {
      applyDetection(challenge, state, effects);
    }
  }

  if (state.status === 'playing' && state.turn >= challenge.turnLimit) {
    lose(state, effects, 'timeout');
  }

  return { state, effects };
}
