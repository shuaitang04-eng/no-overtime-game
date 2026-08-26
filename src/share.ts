import type { RunResult } from './game/types';

export function buildShareText(result: RunResult, streak: number, url: string): string {
  const caught = result.suspicion === 0 ? '全程没被发现' : `被发现 ${result.suspicion} 次`;
  const streakText = streak > 1 ? `｜连续逃班 ${streak} 天` : '';
  return [
    `《今天不加班》${result.dateKey}`,
    `✅ ${result.turns} 回合成功开溜｜${caught}${streakText}`,
    '你也来试试今天的办公室：',
    url,
  ].join('\n');
}

export async function writeClipboard(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) {
      return false;
    }
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
