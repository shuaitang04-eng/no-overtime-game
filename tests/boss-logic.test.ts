import { describe, expect, it } from 'vitest';

import {
  applyBossAction,
  chooseEmployeeAction,
  createInitialBossState,
  getEmployeeGoalKind,
} from '../src/game/boss-logic';
import type { BossChallengeDefinition } from '../src/game/types';
import { getVisionRange } from '../src/game/vision';

function challenge(
  overrides: Partial<BossChallengeDefinition> = {},
): BossChallengeDefinition {
  return {
    schemaVersion: 1,
    mode: 'boss-campaign',
    challengeId: 'boss-campaign:test',
    levelId: 'test',
    levelNumber: 1,
    title: '测试关',
    description: '测试',
    seed: 101,
    layoutId: 'boss-test',
    width: 7,
    height: 7,
    tiles: [
      '#######',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#######',
    ],
    start: { x: 3, y: 3 },
    card: { x: 3, y: 1 },
    exit: { x: 5, y: 3 },
    bossPath: [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 3 },
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 2, y: 5 },
      { x: 1, y: 5 },
      { x: 1, y: 4 },
      { x: 1, y: 3 },
      { x: 1, y: 2 },
    ],
    bossStartIndex: 8,
    bossStartDirection: 1,
    events: [],
    turnLimit: 30,
    actionLimits: { holds: 2, reversals: 2, reverseCooldownTurns: 2 },
    employeeActionPriority: ['up', 'right', 'down', 'left', 'wait'],
    ...overrides,
  };
}

describe('boss mode rules', () => {
  it('spends limited holds and reversals while enforcing a two-turn cooldown', () => {
    const definition = challenge();
    let state = createInitialBossState(definition);

    state = applyBossAction(definition, state, 'reverse').state;
    expect(state.reversalsRemaining).toBe(1);
    expect(state.reverseCooldown).toBe(2);

    const blocked = applyBossAction(definition, state, 'reverse');
    expect(blocked.state).toBe(state);
    expect(blocked.effects).toEqual([{ kind: 'blocked', reason: 'reverse-cooldown' }]);

    state = applyBossAction(definition, state, 'advance').state;
    expect(state.reverseCooldown).toBe(1);
    state = applyBossAction(definition, state, 'hold').state;
    expect(state.reverseCooldown).toBe(0);
    expect(state.holdsRemaining).toBe(1);
    state = applyBossAction(definition, state, 'reverse').state;
    expect(state.reversalsRemaining).toBe(0);
  });

  it('does not spend a turn when a limited command is exhausted', () => {
    const definition = challenge();
    const state = { ...createInitialBossState(definition), holdsRemaining: 0 };
    const transition = applyBossAction(definition, state, 'hold');
    expect(transition.state).toBe(state);
    expect(transition.state.turn).toBe(0);
    expect(transition.effects).toEqual([{ kind: 'blocked', reason: 'no-holds' }]);
  });

  it('uses a deterministic cautious employee policy and switches goals after taking the card', () => {
    const definition = challenge();
    const state = createInitialBossState(definition);
    expect(chooseEmployeeAction(definition, state)).toBe('up');
    expect(chooseEmployeeAction(definition, state)).toBe('up');
    expect(getEmployeeGoalKind(state)).toBe('card');

    const withCard = { ...state, employeeHasCard: true };
    expect(chooseEmployeeAction(definition, withCard)).toBe('right');
    expect(getEmployeeGoalKind(withCard)).toBe('exit');
  });

  it('chooses the employee move before seeing the submitted boss command', () => {
    const definition = challenge();
    const state = createInitialBossState(definition);
    const advancing = applyBossAction(definition, state, 'advance');
    const reversing = applyBossAction(definition, state, 'reverse');
    expect(advancing.employeeAction).toBe(reversing.employeeAction);
    expect(advancing.employeeAction).toBe('up');
  });

  it('routes around an active cleaning cart and applies a triggered blackout', () => {
    const definition = challenge({
      events: [
        {
          id: 'cart-active',
          kind: 'cleaning-cart',
          triggerTurn: 0,
          duration: 3,
          target: { x: 3, y: 2 },
        },
        { id: 'blackout-next', kind: 'blackout', triggerTurn: 1, duration: 2 },
      ],
    });
    const transition = applyBossAction(
      definition,
      createInitialBossState(definition),
      'hold',
    );

    expect(transition.employeeAction).toBe('right');
    expect(transition.state.employee).toEqual({ x: 4, y: 3 });
    expect(transition.effects).toContainEqual({
      kind: 'event-started',
      event: definition.events[1],
    });
    expect(getVisionRange(definition, transition.state.turn)).toBe(1);
  });

  it('counts a crossing as a catch and gives capture precedence over escape', () => {
    const definition = challenge({
      width: 5,
      height: 5,
      tiles: ['#####', '#####', '#...#', '#####', '#####'],
      start: { x: 3, y: 2 },
      card: { x: 1, y: 2 },
      exit: { x: 2, y: 2 },
      bossPath: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
      ],
      bossStartIndex: 0,
      bossStartDirection: 1,
      employeeActionPriority: ['left', 'wait', 'right', 'up', 'down'],
    });
    const state = {
      ...createInitialBossState(definition),
      catches: 1,
      employeeHasCard: true,
    };
    const transition = applyBossAction(definition, state, 'advance');
    expect(transition.employeeAction).toBe('left');
    expect(transition.effects).toContainEqual({ kind: 'employee-caught', catches: 2 });
    expect(transition.state.status).toBe('boss-won');
    expect(transition.state.winReason).toBe('caught');
    expect(transition.effects).not.toContainEqual({ kind: 'employee-escaped' });
  });

  it('returns the employee to their desk without a card after the first catch', () => {
    const definition = challenge({
      width: 5,
      height: 5,
      tiles: ['#####', '#####', '#...#', '#####', '#####'],
      start: { x: 3, y: 2 },
      card: { x: 1, y: 2 },
      exit: { x: 1, y: 2 },
      bossPath: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
      ],
      bossStartIndex: 0,
      bossStartDirection: 1,
      employeeActionPriority: ['left', 'wait', 'right', 'up', 'down'],
    });
    const state = { ...createInitialBossState(definition), employeeHasCard: true };
    const transition = applyBossAction(definition, state, 'advance');
    expect(transition.state.status).toBe('playing');
    expect(transition.state.catches).toBe(1);
    expect(transition.state.employee).toEqual(definition.start);
    expect(transition.state.employeeHasCard).toBe(false);
  });

  it('wins on timeout but loses when the employee reaches the elevator first', () => {
    const timeoutDefinition = challenge({ turnLimit: 1 });
    const timedOut = applyBossAction(
      timeoutDefinition,
      createInitialBossState(timeoutDefinition),
      'hold',
    );
    expect(timedOut.state.status).toBe('boss-won');
    expect(timedOut.state.winReason).toBe('timeout');

    const escapeDefinition = challenge({ exit: { x: 3, y: 2 } });
    const escapingState = {
      ...createInitialBossState(escapeDefinition),
      employeeHasCard: true,
    };
    const escaped = applyBossAction(escapeDefinition, escapingState, 'hold');
    expect(escaped.state.status).toBe('employee-escaped');
    expect(escaped.effects).toContainEqual({ kind: 'employee-escaped' });
  });

  it('keeps the boss state serializable', () => {
    const state = createInitialBossState(challenge());
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
