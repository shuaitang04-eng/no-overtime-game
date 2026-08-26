import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN_LEVELS,
  getNextCampaignLevel,
  isCampaignLevelUnlocked,
} from '../src/game/campaign';
import { applyAction, createInitialState } from '../src/game/logic';
import { findSolution } from '../src/game/solver';

describe('campaign levels', () => {
  it('defines five ordered, unique, handcrafted levels', () => {
    expect(CAMPAIGN_LEVELS).toHaveLength(5);
    expect(CAMPAIGN_LEVELS.map((level) => level.number)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(CAMPAIGN_LEVELS.map((level) => level.id)).size).toBe(5);
    expect(CAMPAIGN_LEVELS.every((level) => level.challenge.mode === 'campaign')).toBe(true);
  });

  it('keeps every level solvable without detection and requires a meaningful route', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const solution = findSolution(level.challenge, 0);
      expect(solution, level.id).not.toBeNull();
      expect(solution?.length, level.id).toBeGreaterThanOrEqual(10);
      expect(solution?.length, level.id).toBeLessThanOrEqual(level.challenge.turnLimit);

      let state = createInitialState(level.challenge);
      let pickedCard = false;
      for (const action of solution ?? []) {
        const transition = applyAction(level.challenge, state, action);
        state = transition.state;
        pickedCard ||= transition.effects.some((effect) => effect.kind === 'card-picked');
      }
      expect(pickedCard, level.id).toBe(true);
      expect(state.status, level.id).toBe('won');
      expect(state.suspicion, level.id).toBe(0);
    }
  });

  it('introduces the three event mechanics in the planned order and timing', () => {
    expect(
      CAMPAIGN_LEVELS.map((level) =>
        level.challenge.events.map((event) => ({
          kind: event.kind,
          triggerTurn: event.triggerTurn,
          duration: event.kind === 'meeting' ? undefined : event.duration,
        })),
      ),
    ).toEqual([
      [],
      [],
      [{ kind: 'cleaning-cart', triggerTurn: 9, duration: 5 }],
      [{ kind: 'meeting', triggerTurn: 7, duration: undefined }],
      [
        { kind: 'cleaning-cart', triggerTurn: 6, duration: 4 },
        { kind: 'meeting', triggerTurn: 11, duration: undefined },
        { kind: 'blackout', triggerTurn: 16, duration: 4 },
      ],
    ]);
  });

  it('makes waiting and campaign events affect the safe route', () => {
    const level2Solution = findSolution(CAMPAIGN_LEVELS[1]!.challenge, 0);
    expect(level2Solution).toContain('wait');

    const level3 = CAMPAIGN_LEVELS[2]!.challenge;
    const level3Solution = findSolution(level3, 0);
    const level3WithoutCart = findSolution({ ...level3, events: [] }, 0);
    expect(level3Solution).toContain('wait');
    expect(level3Solution!.length).toBeGreaterThan(level3WithoutCart!.length);

    for (const level of CAMPAIGN_LEVELS.slice(3)) {
      const withEvents = findSolution(level.challenge, 0);
      const withoutEvents = findSolution({ ...level.challenge, events: [] }, 0);
      expect(withEvents, level.id).not.toEqual(withoutEvents);
    }
  });

  it('keeps handcrafted level signatures stable', () => {
    expect(
      CAMPAIGN_LEVELS.map((level) => ({
        id: level.id,
        layout: level.challenge.layoutId,
        events: level.challenge.events.map((event) => event.kind),
        solutionLength: findSolution(level.challenge, 0)?.length,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "events": [],
          "id": "rookie-drill",
          "layout": "campaign-open",
          "solutionLength": 12,
        },
        {
          "events": [],
          "id": "cubicle-maze",
          "layout": "campaign-cubicles",
          "solutionLength": 20,
        },
        {
          "events": [
            "cleaning-cart",
          ],
          "id": "cleaning-shift",
          "layout": "campaign-corners",
          "solutionLength": 20,
        },
        {
          "events": [
            "meeting",
          ],
          "id": "sudden-meeting",
          "layout": "campaign-diagonal",
          "solutionLength": 25,
        },
        {
          "events": [
            "cleaning-cart",
            "meeting",
            "blackout",
          ],
          "id": "last-minute",
          "layout": "campaign-finale",
          "solutionLength": 28,
        },
      ]
    `);
  });

  it('unlocks levels only after all previous levels are complete', () => {
    const empty = { completedLevelIds: [] };
    expect(isCampaignLevelUnlocked(CAMPAIGN_LEVELS[0]!, empty)).toBe(true);
    expect(isCampaignLevelUnlocked(CAMPAIGN_LEVELS[1]!, empty)).toBe(false);

    const firstComplete = { completedLevelIds: [CAMPAIGN_LEVELS[0]!.id] };
    expect(isCampaignLevelUnlocked(CAMPAIGN_LEVELS[1]!, firstComplete)).toBe(true);
    expect(isCampaignLevelUnlocked(CAMPAIGN_LEVELS[2]!, firstComplete)).toBe(false);
  });

  it('links each level to its successor and ends after level five', () => {
    expect(getNextCampaignLevel(CAMPAIGN_LEVELS[0]!.id)?.number).toBe(2);
    expect(getNextCampaignLevel(CAMPAIGN_LEVELS[4]!.id)).toBeUndefined();
  });
});
