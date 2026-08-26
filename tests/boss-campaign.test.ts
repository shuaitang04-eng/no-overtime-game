import { describe, expect, it } from 'vitest';

import {
  BOSS_CAMPAIGN_LEVELS,
  getNextBossCampaignLevel,
  isBossCampaignLevelUnlocked,
} from '../src/game/boss-campaign';
import { applyBossAction, createInitialBossState } from '../src/game/boss-logic';
import { findBossCapturePlan, findEmployeeEscapePlan } from '../src/game/boss-solver';
import { CAMPAIGN_LEVELS } from '../src/game/campaign';

describe('boss campaign levels', () => {
  it('defines five new ordered levels with fixed anti-camping limits', () => {
    expect(BOSS_CAMPAIGN_LEVELS).toHaveLength(5);
    expect(BOSS_CAMPAIGN_LEVELS.map((level) => level.number)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(BOSS_CAMPAIGN_LEVELS.map((level) => level.id)).size).toBe(5);
    const employeeLayoutIds = new Set(
      CAMPAIGN_LEVELS.map((level) => level.challenge.layoutId),
    );
    for (const level of BOSS_CAMPAIGN_LEVELS) {
      expect(employeeLayoutIds.has(level.challenge.layoutId), level.id).toBe(false);
      expect(level.challenge.actionLimits, level.id).toEqual({
        holds: 2,
        reversals: 2,
        reverseCooldownTurns: 2,
      });
      expect(new Set(level.challenge.employeeActionPriority), level.id).toEqual(
        new Set(['up', 'right', 'down', 'left', 'wait']),
      );
    }
  });

  it('gives the boss a two-catch plan and the employee an escape under poor commands', () => {
    for (const level of BOSS_CAMPAIGN_LEVELS) {
      const capturePlan = findBossCapturePlan(level.challenge);
      const escapePlan = findEmployeeEscapePlan(level.challenge);
      expect(capturePlan, level.id).not.toBeNull();
      expect(escapePlan, level.id).not.toBeNull();
      expect(capturePlan!.length, level.id).toBeLessThan(level.challenge.turnLimit);
      expect(escapePlan!.length, level.id).toBeLessThanOrEqual(level.challenge.turnLimit);

      let bossState = createInitialBossState(level.challenge);
      for (const action of capturePlan ?? []) {
        bossState = applyBossAction(level.challenge, bossState, action).state;
      }
      expect(bossState.status, level.id).toBe('boss-won');
      expect(bossState.winReason, level.id).toBe('caught');
      expect(bossState.catches, level.id).toBe(2);

      let escapeState = createInitialBossState(level.challenge);
      for (const action of escapePlan ?? []) {
        escapeState = applyBossAction(level.challenge, escapeState, action).state;
      }
      expect(escapeState.status, level.id).toBe('employee-escaped');
    }
  });

  it('keeps handcrafted boss level signatures stable', () => {
    expect(
      BOSS_CAMPAIGN_LEVELS.map((level) => ({
        id: level.id,
        layout: level.challenge.layoutId,
        events: level.challenge.events.map((event) => ({
          kind: event.kind,
          triggerTurn: event.triggerTurn,
        })),
        captureLength: findBossCapturePlan(level.challenge)?.length,
        escapeLength: findEmployeeEscapePlan(level.challenge)?.length,
      })),
    ).toEqual([
      {
        id: 'routine-inspection',
        layout: 'boss-routine',
        events: [],
        captureLength: 8,
        escapeLength: 17,
      },
      {
        id: 'partition-blind-spots',
        layout: 'boss-blind-spots',
        events: [],
        captureLength: 11,
        escapeLength: 17,
      },
      {
        id: 'cleaning-detour',
        layout: 'boss-cleaning-detour',
        events: [{ kind: 'cleaning-cart', triggerTurn: 7 }],
        captureLength: 13,
        escapeLength: 13,
      },
      {
        id: 'blackout-watch',
        layout: 'boss-blackout-watch',
        events: [{ kind: 'blackout', triggerTurn: 8 }],
        captureLength: 14,
        escapeLength: 18,
      },
      {
        id: 'final-round',
        layout: 'boss-final-round',
        events: [
          { kind: 'cleaning-cart', triggerTurn: 6 },
          { kind: 'blackout', triggerTurn: 11 },
          { kind: 'blackout', triggerTurn: 21 },
        ],
        captureLength: 15,
        escapeLength: 18,
      },
    ]);
  });

  it('unlocks boss levels independently and in order', () => {
    const empty = { completedLevelIds: [] };
    expect(isBossCampaignLevelUnlocked(BOSS_CAMPAIGN_LEVELS[0]!, empty)).toBe(true);
    expect(isBossCampaignLevelUnlocked(BOSS_CAMPAIGN_LEVELS[1]!, empty)).toBe(false);

    const firstComplete = { completedLevelIds: [BOSS_CAMPAIGN_LEVELS[0]!.id] };
    expect(isBossCampaignLevelUnlocked(BOSS_CAMPAIGN_LEVELS[1]!, firstComplete)).toBe(true);
    expect(isBossCampaignLevelUnlocked(BOSS_CAMPAIGN_LEVELS[2]!, firstComplete)).toBe(false);
    expect(getNextBossCampaignLevel(BOSS_CAMPAIGN_LEVELS[0]!.id)?.number).toBe(2);
    expect(getNextBossCampaignLevel(BOSS_CAMPAIGN_LEVELS[4]!.id)).toBeUndefined();
  });
});
