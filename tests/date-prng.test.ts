import { describe, expect, it } from 'vitest';

import { getShanghaiDateKey, previousDateKey } from '../src/game/date';
import { createRandom, hashString } from '../src/game/prng';

describe('date utilities', () => {
  it('switches days at midnight in Asia/Shanghai', () => {
    expect(getShanghaiDateKey(new Date('2026-08-26T15:59:59.000Z'))).toBe('2026-08-26');
    expect(getShanghaiDateKey(new Date('2026-08-26T16:00:00.000Z'))).toBe('2026-08-27');
  });

  it('handles month and leap-year boundaries', () => {
    expect(previousDateKey('2028-03-01')).toBe('2028-02-29');
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
  });
});

describe('seeded randomness', () => {
  it('is deterministic for hashes, numbers, picks, and shuffles', () => {
    expect(hashString('1:2026-08-26')).toBe(hashString('1:2026-08-26'));
    const first = createRandom(42);
    const second = createRandom(42);
    expect([first.next(), first.int(1, 10), first.pick(['a', 'b']), first.shuffle([1, 2, 3])]).toEqual(
      [second.next(), second.int(1, 10), second.pick(['a', 'b']), second.shuffle([1, 2, 3])],
    );
  });
});
