import { describe, expect, it } from 'vitest';

import { applyAction, createInitialState } from '../src/game/logic';
import type { ChallengeDefinition, DailyChallengeDefinition, GameState } from '../src/game/types';
import { getBossVision, getVisionRange } from '../src/game/vision';

function simpleChallenge(overrides: Partial<DailyChallengeDefinition> = {}): ChallengeDefinition {
  return {
    schemaVersion: 1,
    mode: 'daily',
    challengeId: 'daily:2026-08-26',
    dateKey: '2026-08-26',
    seed: 1,
    layoutId: 'test',
    width: 5,
    height: 5,
    tiles: ['#####', '#...#', '#...#', '#...#', '#####'],
    start: { x: 1, y: 1 },
    card: { x: 2, y: 1 },
    exit: { x: 3, y: 1 },
    bossPath: [
      { x: 0, y: 3 },
      { x: 0, y: 2 },
    ],
    bossStartIndex: 0,
    bossStartDirection: 1,
    events: [],
    turnLimit: 30,
    ...overrides,
  };
}

describe('game rules', () => {
  it('does not spend a turn when movement is blocked', () => {
    const challenge = simpleChallenge();
    const result = applyAction(challenge, createInitialState(challenge), 'up');
    expect(result.state.turn).toBe(0);
    expect(result.effects).toEqual([{ kind: 'blocked' }]);
  });

  it('requires the card before the elevator can win', () => {
    const challenge = simpleChallenge();
    let state = createInitialState(challenge);
    state = applyAction(challenge, state, 'right').state;
    expect(state.hasCard).toBe(true);
    state = applyAction(challenge, state, 'right').state;
    expect(state.status).toBe('won');
    expect(state.turn).toBe(2);
  });

  it('returns the player and card after the first detection, then loses on the second', () => {
    const challenge = simpleChallenge({
      start: { x: 3, y: 1 },
      card: { x: 3, y: 2 },
      exit: { x: 1, y: 3 },
      bossPath: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
      ],
    });
    let state = createInitialState(challenge);
    state.hasCard = true;
    state = applyAction(challenge, state, 'wait').state;
    expect(state.suspicion).toBe(1);
    expect(state.player).toEqual(challenge.start);
    expect(state.hasCard).toBe(false);
    state = applyAction(challenge, state, 'wait').state;
    expect(state.status).toBe('lost');
    expect(state.lossReason).toBe('caught');
  });

  it('loses when the meeting countdown reaches zero', () => {
    const challenge = simpleChallenge({ turnLimit: 1 });
    const result = applyAction(challenge, createInitialState(challenge), 'wait');
    expect(result.state.status).toBe('lost');
    expect(result.state.lossReason).toBe('timeout');
  });

  it('reverses the patrol when a meeting event starts', () => {
    const challenge = simpleChallenge({
      events: [{ id: 'meeting-1', kind: 'meeting', triggerTurn: 1 }],
    });
    const result = applyAction(challenge, createInitialState(challenge), 'wait');
    expect(result.state.bossDirection).toBe(-1);
    expect(result.effects).toContainEqual({
      kind: 'event-started',
      event: challenge.events[0],
    });
  });

  it('shortens vision during a blackout', () => {
    const challenge = simpleChallenge({
      events: [{ id: 'blackout-2', kind: 'blackout', triggerTurn: 2, duration: 4 }],
    });
    expect(getVisionRange(challenge, 1)).toBe(3);
    expect(getVisionRange(challenge, 2)).toBe(1);
    expect(getVisionRange(challenge, 6)).toBe(3);
  });

  it('blocks a cleaning-cart tile while the event is active', () => {
    const challenge = simpleChallenge({
      events: [
        {
          id: 'cleaning-cart-0',
          kind: 'cleaning-cart',
          triggerTurn: 0,
          duration: 4,
          target: { x: 2, y: 1 },
        },
      ],
    });
    const result = applyAction(challenge, createInitialState(challenge), 'right');
    expect(result.state.turn).toBe(0);
    expect(result.effects).toEqual([{ kind: 'blocked' }]);
  });

  it('stops sight behind furniture', () => {
    const challenge = simpleChallenge({
      width: 7,
      tiles: ['#######', '#.....#', '#..D..#', '#.....#', '#######'],
      bossPath: [
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ],
    });
    const vision = getBossVision(challenge, 0, 1, 0);
    expect(vision).toContainEqual({ x: 3, y: 2 });
    expect(vision).not.toContainEqual({ x: 4, y: 2 });
  });

  it('keeps game state serializable', () => {
    const state: GameState = createInitialState(simpleChallenge());
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
