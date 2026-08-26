import { describe, expect, it } from 'vitest';

import { generateDailyChallenge } from '../src/game/challenge';
import { findSolution } from '../src/game/solver';

function dateKeys(start: string, count: number): string[] {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
}

function signature(dateKey: string): unknown {
  const challenge = generateDailyChallenge(dateKey);
  return {
    dateKey: challenge.dateKey,
    seed: challenge.seed,
    layoutId: challenge.layoutId,
    start: challenge.start,
    card: challenge.card,
    exit: challenge.exit,
    bossStartIndex: challenge.bossStartIndex,
    bossStartDirection: challenge.bossStartDirection,
    events: challenge.events,
    solutionLength: findSolution(challenge, 0)?.length,
  };
}

describe('daily challenge generation', () => {
  it('returns byte-for-byte identical challenges for the same day', () => {
    const first = generateDailyChallenge('2026-08-26');
    const second = generateDailyChallenge('2026-08-26');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('changes the challenge on different days', () => {
    expect(generateDailyChallenge('2026-08-26').seed).not.toBe(
      generateDailyChallenge('2026-08-27').seed,
    );
  });

  it('keeps golden daily challenges stable', () => {
    expect([signature('2026-08-26'), signature('2026-12-31')]).toMatchInlineSnapshot(`
      [
        {
          "bossStartDirection": -1,
          "bossStartIndex": 22,
          "card": {
            "x": 1,
            "y": 1,
          },
          "dateKey": "2026-08-26",
          "events": [
            {
              "duration": 4,
              "id": "cleaning-cart-9",
              "kind": "cleaning-cart",
              "target": {
                "x": 3,
                "y": 3,
              },
              "triggerTurn": 9,
            },
            {
              "id": "meeting-18",
              "kind": "meeting",
              "triggerTurn": 18,
            },
          ],
          "exit": {
            "x": 8,
            "y": 1,
          },
          "layoutId": "diagonal-desks",
          "seed": 3454738438,
          "solutionLength": 17,
          "start": {
            "x": 5,
            "y": 5,
          },
        },
        {
          "bossStartDirection": 1,
          "bossStartIndex": 23,
          "card": {
            "x": 8,
            "y": 6,
          },
          "dateKey": "2026-12-31",
          "events": [
            {
              "duration": 4,
              "id": "cleaning-cart-7",
              "kind": "cleaning-cart",
              "target": {
                "x": 5,
                "y": 3,
              },
              "triggerTurn": 7,
            },
            {
              "duration": 4,
              "id": "blackout-17",
              "kind": "blackout",
              "triggerTurn": 17,
            },
          ],
          "exit": {
            "x": 8,
            "y": 1,
          },
          "layoutId": "cubicle-maze",
          "seed": 2098293303,
          "solutionLength": 20,
          "start": {
            "x": 3,
            "y": 3,
          },
        },
      ]
    `);
  });

  it('builds a meaningful no-detection solution across five calendar years', () => {
    for (const dateKey of dateKeys('2026-01-01', 1_826)) {
      const challenge = generateDailyChallenge(dateKey);
      const solution = findSolution(challenge, 0);
      expect(solution, dateKey).not.toBeNull();
      expect(solution?.length, dateKey).toBeGreaterThanOrEqual(10);
      expect(solution?.length, dateKey).toBeLessThanOrEqual(challenge.turnLimit);
      expect(challenge.events, dateKey).toHaveLength(2);
      expect(new Set(challenge.events.map((event) => event.kind)).size, dateKey).toBe(2);
      expect(challenge.card, dateKey).not.toEqual(challenge.exit);
    }
  }, 30_000);
});
