import { describe, expect, it } from 'vitest';

import type { RunResult } from '../src/game/types';
import {
  STORAGE_KEY,
  createDefaultSave,
  loadSave,
  persistSave,
  recordWin,
  type StorageLike,
} from '../src/persistence';
import { buildShareText } from '../src/share';

class MemoryStorage implements StorageLike {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function result(dateKey: string, turns: number, suspicion = 0): RunResult {
  return { dateKey, turns, suspicion, completedAt: `${dateKey}T12:00:00.000Z` };
}

describe('local persistence', () => {
  it('falls back safely when stored data is corrupt or from another version', () => {
    const storage = new MemoryStorage();
    storage.values.set(STORAGE_KEY, '{broken');
    expect(loadSave(storage)).toEqual(createDefaultSave());
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 999, muted: true }));
    expect(loadSave(storage)).toEqual(createDefaultSave());
  });

  it('round-trips a valid save', () => {
    const storage = new MemoryStorage();
    const save = { ...createDefaultSave(), muted: true, seenTutorial: true };
    persistSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('keeps the best result and updates consecutive-day streaks once per day', () => {
    let save = recordWin(createDefaultSave(), result('2026-08-25', 22, 1));
    save = recordWin(save, result('2026-08-26', 24, 0));
    expect(save.streak).toBe(2);
    save = recordWin(save, result('2026-08-26', 18, 1));
    expect(save.streak).toBe(2);
    expect(save.bestByDate['2026-08-26']?.turns).toBe(18);
    save = recordWin(save, result('2026-08-26', 18, 0));
    expect(save.bestByDate['2026-08-26']?.suspicion).toBe(0);
    save = recordWin(save, result('2026-08-28', 15, 0));
    expect(save.streak).toBe(1);
  });
});

describe('sharing', () => {
  it('builds a Chinese result with streak and URL', () => {
    expect(buildShareText(result('2026-08-26', 18), 3, 'https://example.test/game/')).toBe(
      '《今天不加班》2026-08-26\n' +
        '✅ 18 回合成功开溜｜全程没被发现｜连续逃班 3 天\n' +
        '你也来试试今天的办公室：\n' +
        'https://example.test/game/',
    );
  });
});
