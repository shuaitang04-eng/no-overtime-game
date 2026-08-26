import { previousDateKey } from './game/date';
import { CAMPAIGN_LEVELS, isCampaignLevelUnlocked } from './game/campaign';
import type { CampaignProgress, RunResult } from './game/types';

export const SAVE_VERSION = 2;
export const STORAGE_KEY = 'no-overtime-game:save:v2';
export const LEGACY_STORAGE_KEY = 'no-overtime-game:save:v1';

export interface SaveData {
  version: number;
  seenTutorial: boolean;
  muted: boolean;
  bestByDate: Record<string, RunResult>;
  streak: number;
  lastCompletedDate: string | null;
  campaignProgress: CampaignProgress;
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
    campaignProgress: { completedLevelIds: [] },
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

interface LegacySaveData {
  version: 1;
  seenTutorial?: unknown;
  muted?: unknown;
  bestByDate?: unknown;
  streak?: unknown;
  lastCompletedDate?: unknown;
}

function sanitizeBestByDate(value: unknown): Record<string, RunResult> {
  const bestByDate: Record<string, RunResult> = {};
  if (value && typeof value === 'object') {
    for (const [key, result] of Object.entries(value)) {
      if (isRunResult(result) && result.dateKey === key) {
        bestByDate[key] = result;
      }
    }
  }
  return bestByDate;
}

function migrateLegacySave(candidate: LegacySaveData): SaveData {
  return {
    version: SAVE_VERSION,
    seenTutorial: candidate.seenTutorial === true,
    muted: candidate.muted === true,
    bestByDate: sanitizeBestByDate(candidate.bestByDate),
    streak:
      typeof candidate.streak === 'number' && Number.isInteger(candidate.streak) && candidate.streak >= 0
        ? candidate.streak
        : 0,
    lastCompletedDate:
      typeof candidate.lastCompletedDate === 'string' ? candidate.lastCompletedDate : null,
    campaignProgress: { completedLevelIds: [] },
  };
}

function sanitizeSave(value: unknown): SaveData {
  if (!value || typeof value !== 'object') {
    return createDefaultSave();
  }
  const candidate = value as Partial<SaveData>;
  if (candidate.version === 1) {
    return migrateLegacySave(value as LegacySaveData);
  }
  if (candidate.version !== SAVE_VERSION) {
    return createDefaultSave();
  }

  const validLevelIds = new Set(CAMPAIGN_LEVELS.map((level) => level.id));
  const storedLevelIds = new Set(
    Array.isArray(candidate.campaignProgress?.completedLevelIds)
      ? candidate.campaignProgress.completedLevelIds.filter(
          (id): id is string => typeof id === 'string' && validLevelIds.has(id),
        )
      : [],
  );
  const completedLevelIds: string[] = [];
  for (const level of CAMPAIGN_LEVELS) {
    if (!storedLevelIds.has(level.id)) break;
    completedLevelIds.push(level.id);
  }

  return {
    version: SAVE_VERSION,
    seenTutorial: candidate.seenTutorial === true,
    muted: candidate.muted === true,
    bestByDate: sanitizeBestByDate(candidate.bestByDate),
    streak:
      typeof candidate.streak === 'number' && Number.isInteger(candidate.streak) && candidate.streak >= 0
        ? candidate.streak
        : 0,
    lastCompletedDate:
      typeof candidate.lastCompletedDate === 'string' ? candidate.lastCompletedDate : null,
    campaignProgress: { completedLevelIds },
  };
}

export function loadSave(storage: StorageLike): SaveData {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      return sanitizeSave(JSON.parse(raw) as unknown);
    }
    const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY);
    return legacyRaw ? sanitizeSave(JSON.parse(legacyRaw) as unknown) : createDefaultSave();
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

export function recordCampaignCompletion(save: SaveData, levelId: string): SaveData {
  const level = CAMPAIGN_LEVELS.find((candidate) => candidate.id === levelId);
  if (
    !level ||
    save.campaignProgress.completedLevelIds.includes(levelId) ||
    !isCampaignLevelUnlocked(level, save.campaignProgress)
  ) {
    return save;
  }
  return {
    ...save,
    campaignProgress: {
      completedLevelIds: [...save.campaignProgress.completedLevelIds, levelId],
    },
  };
}
