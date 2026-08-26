import { previousDateKey } from './game/date';
import {
  BOSS_CAMPAIGN_LEVELS,
  isBossCampaignLevelUnlocked,
} from './game/boss-campaign';
import { CAMPAIGN_LEVELS, isCampaignLevelUnlocked } from './game/campaign';
import type { BossCampaignProgress, CampaignProgress, RunResult } from './game/types';

export const SAVE_VERSION = 3;
export const STORAGE_KEY = 'no-overtime-game:save:v3';
export const LEGACY_V2_STORAGE_KEY = 'no-overtime-game:save:v2';
export const LEGACY_STORAGE_KEY = 'no-overtime-game:save:v1';

export interface SaveData {
  version: number;
  seenTutorial: boolean;
  seenBossTutorial: boolean;
  muted: boolean;
  bestByDate: Record<string, RunResult>;
  streak: number;
  lastCompletedDate: string | null;
  campaignProgress: CampaignProgress;
  bossCampaignProgress: BossCampaignProgress;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    seenTutorial: false,
    seenBossTutorial: false,
    muted: false,
    bestByDate: {},
    streak: 0,
    lastCompletedDate: null,
    campaignProgress: { completedLevelIds: [] },
    bossCampaignProgress: { completedLevelIds: [] },
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

interface LegacyV2SaveData extends Omit<LegacySaveData, 'version'> {
  version: 2;
  campaignProgress?: unknown;
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

function sanitizeOrderedProgress(
  value: unknown,
  orderedLevelIds: string[],
): string[] {
  const validLevelIds = new Set(orderedLevelIds);
  const candidate = value as { completedLevelIds?: unknown } | null;
  const storedLevelIds = new Set(
    Array.isArray(candidate?.completedLevelIds)
      ? candidate.completedLevelIds.filter(
          (id): id is string => typeof id === 'string' && validLevelIds.has(id),
        )
      : [],
  );
  const completedLevelIds: string[] = [];
  for (const levelId of orderedLevelIds) {
    if (!storedLevelIds.has(levelId)) break;
    completedLevelIds.push(levelId);
  }
  return completedLevelIds;
}

function migrateLegacySave(
  candidate: LegacySaveData | LegacyV2SaveData,
): SaveData {
  const campaignProgress =
    candidate.version === 2
      ? sanitizeOrderedProgress(
          candidate.campaignProgress,
          CAMPAIGN_LEVELS.map((level) => level.id),
        )
      : [];
  return {
    version: SAVE_VERSION,
    seenTutorial: candidate.seenTutorial === true,
    seenBossTutorial: false,
    muted: candidate.muted === true,
    bestByDate: sanitizeBestByDate(candidate.bestByDate),
    streak:
      typeof candidate.streak === 'number' && Number.isInteger(candidate.streak) && candidate.streak >= 0
        ? candidate.streak
        : 0,
    lastCompletedDate:
      typeof candidate.lastCompletedDate === 'string' ? candidate.lastCompletedDate : null,
    campaignProgress: { completedLevelIds: campaignProgress },
    bossCampaignProgress: { completedLevelIds: [] },
  };
}

function sanitizeSave(value: unknown): SaveData {
  if (!value || typeof value !== 'object') {
    return createDefaultSave();
  }
  const candidate = value as Partial<SaveData>;
  if (candidate.version === 1 || candidate.version === 2) {
    return migrateLegacySave(value as LegacySaveData | LegacyV2SaveData);
  }
  if (candidate.version !== SAVE_VERSION) {
    return createDefaultSave();
  }

  const completedLevelIds = sanitizeOrderedProgress(
    candidate.campaignProgress,
    CAMPAIGN_LEVELS.map((level) => level.id),
  );
  const completedBossLevelIds = sanitizeOrderedProgress(
    candidate.bossCampaignProgress,
    BOSS_CAMPAIGN_LEVELS.map((level) => level.id),
  );

  return {
    version: SAVE_VERSION,
    seenTutorial: candidate.seenTutorial === true,
    seenBossTutorial: candidate.seenBossTutorial === true,
    muted: candidate.muted === true,
    bestByDate: sanitizeBestByDate(candidate.bestByDate),
    streak:
      typeof candidate.streak === 'number' && Number.isInteger(candidate.streak) && candidate.streak >= 0
        ? candidate.streak
        : 0,
    lastCompletedDate:
      typeof candidate.lastCompletedDate === 'string' ? candidate.lastCompletedDate : null,
    campaignProgress: { completedLevelIds },
    bossCampaignProgress: { completedLevelIds: completedBossLevelIds },
  };
}

export function loadSave(storage: StorageLike): SaveData {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      return sanitizeSave(JSON.parse(raw) as unknown);
    }
    const legacyV2Raw = storage.getItem(LEGACY_V2_STORAGE_KEY);
    if (legacyV2Raw) {
      return sanitizeSave(JSON.parse(legacyV2Raw) as unknown);
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

export function recordBossCampaignCompletion(save: SaveData, levelId: string): SaveData {
  const level = BOSS_CAMPAIGN_LEVELS.find((candidate) => candidate.id === levelId);
  if (
    !level ||
    save.bossCampaignProgress.completedLevelIds.includes(levelId) ||
    !isBossCampaignLevelUnlocked(level, save.bossCampaignProgress)
  ) {
    return save;
  }
  return {
    ...save,
    bossCampaignProgress: {
      completedLevelIds: [...save.bossCampaignProgress.completedLevelIds, levelId],
    },
  };
}
