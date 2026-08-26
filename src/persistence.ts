import { previousDateKey } from './game/date';
import type { RunResult } from './game/types';

export const SAVE_VERSION = 1;
export const STORAGE_KEY = 'no-overtime-game:save:v1';

export interface SaveData {
  version: number;
  seenTutorial: boolean;
  muted: boolean;
  bestByDate: Record<string, RunResult>;
  streak: number;
  lastCompletedDate: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    seenTutorial: false,
    muted: false,
    bestByDate: {},
    streak: 0,
    lastCompletedDate: null,
  };
}

function isRunResult(value: unknown): value is RunResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const result = value as Partial<RunResult>;
  return (
    typeof result.dateKey === 'string' &&
    typeof result.turns === 'number' &&
    Number.isFinite(result.turns) &&
    typeof result.suspicion === 'number' &&
    Number.isFinite(result.suspicion) &&
    typeof result.completedAt === 'string'
  );
}

function sanitizeSave(value: unknown): SaveData {
  if (!value || typeof value !== 'object') {
    return createDefaultSave();
  }
  const candidate = value as Partial<SaveData>;
  if (candidate.version !== SAVE_VERSION) {
    return createDefaultSave();
  }

  const bestByDate: Record<string, RunResult> = {};
  if (candidate.bestByDate && typeof candidate.bestByDate === 'object') {
    for (const [key, result] of Object.entries(candidate.bestByDate)) {
      if (isRunResult(result) && result.dateKey === key) {
        bestByDate[key] = result;
      }
    }
  }

  return {
    version: SAVE_VERSION,
    seenTutorial: candidate.seenTutorial === true,
    muted: candidate.muted === true,
    bestByDate,
    streak:
      typeof candidate.streak === 'number' && Number.isInteger(candidate.streak) && candidate.streak >= 0
        ? candidate.streak
        : 0,
    lastCompletedDate:
      typeof candidate.lastCompletedDate === 'string' ? candidate.lastCompletedDate : null,
  };
}

export function loadSave(storage: StorageLike): SaveData {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? sanitizeSave(JSON.parse(raw) as unknown) : createDefaultSave();
  } catch {
    return createDefaultSave();
  }
}

export function persistSave(storage: StorageLike, save: SaveData): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(save));
}

function isBetterResult(next: RunResult, current: RunResult | undefined): boolean {
  if (!current) {
    return true;
  }
  return next.turns < current.turns || (next.turns === current.turns && next.suspicion < current.suspicion);
}

export function recordWin(save: SaveData, result: RunResult): SaveData {
  const next: SaveData = {
    ...save,
    bestByDate: { ...save.bestByDate },
  };
  if (isBetterResult(result, next.bestByDate[result.dateKey])) {
    next.bestByDate[result.dateKey] = result;
  }

  if (save.lastCompletedDate !== result.dateKey) {
    next.streak = save.lastCompletedDate === previousDateKey(result.dateKey) ? save.streak + 1 : 1;
    next.lastCompletedDate = result.dateKey;
  }
  return next;
}
