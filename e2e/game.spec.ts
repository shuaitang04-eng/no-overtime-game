import { expect, test, type Page } from '@playwright/test';

import type { GameAction } from '../src/game/types';

async function openGame(page: Page): Promise<void> {
  await page.goto('/no-overtime-game/');
  await expect(page.getByRole('heading', { name: '今天不加班', exact: true })).toBeVisible();
  const tutorial = page.locator('#tutorialModal[data-open="true"]');
  if (await tutorial.isVisible()) {
    await expect(tutorial).toContainText('下班，需要一点策略');
    await page.getByRole('button', { name: '懂了，开始开溜' }).click();
  }
}

async function getSolution(page: Page): Promise<GameAction[]> {
  return page.evaluate(() => window.__NO_OVERTIME_DEBUG__?.getSolution() ?? []);
}

async function solveCurrentChallenge(page: Page): Promise<GameAction[]> {
  const solution = await getSolution(page);
  expect(solution.length).toBeGreaterThanOrEqual(10);
  await page.evaluate((actions) => {
    for (const action of actions) window.__NO_OVERTIME_DEBUG__?.dispatch(action);
  }, solution);
  await expect(page.locator('#resultModal[data-open="true"]')).toBeVisible();
  return solution;
}

const keyByAction: Record<GameAction, string> = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  wait: 'Space',
};

test('loads every production-facing resource without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/no-overtime-game/', { waitUntil: 'networkidle' });
  await expect(page.locator('#gameCanvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('desktop keyboard completes the daily challenge and keeps the best result', async ({ page }) => {
  await openGame(page);
  const solution = await getSolution(page);
  expect(solution.length).toBeGreaterThanOrEqual(10);

  for (const action of solution) {
    await page.keyboard.press(keyByAction[action]);
  }

  await expect(page.locator('#resultModal[data-open="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '今天也没有加班！' })).toBeVisible();
  await expect(page.locator('#resultStats')).toContainText(`${solution.length}`);

  await page.reload();
  await expect(page.locator('#tutorialModal')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#bestValue')).toHaveText(`${solution.length} 回合`);
});

test('mobile controls can complete the same deterministic challenge', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only interaction check');
  await openGame(page);
  const solution = await getSolution(page);

  for (const action of solution) {
    await page.locator(`[data-action="${action}"]`).click();
  }

  await expect(page.locator('#resultModal[data-open="true"]')).toBeVisible();
  await expect(page.locator('#resultTitle')).toHaveText('今天也没有加班！');
});

test('timeout reaches the failure result and allows a retry', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    for (let turn = 0; turn < 31; turn += 1) {
      window.__NO_OVERTIME_DEBUG__?.dispatch('wait');
    }
  });
  await expect(page.locator('#resultModal[data-open="true"]')).toBeVisible();
  await expect(page.locator('#resultKicker')).toContainText('OVERTIME');
  await page.getByRole('button', { name: '再来一次' }).click();
  await expect(page.locator('#turnValue')).toHaveText('30');
});

test('mute preference persists and share has a manual-copy fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await openGame(page);
  await page.getByRole('button', { name: '声音：开' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '声音：关' })).toBeVisible();

  const solution = await getSolution(page);
  for (const action of solution) {
    await page.locator(`[data-action="${action}"]`).click();
  }
  await page.getByRole('button', { name: '复制战绩' }).click();
  await expect(page.locator('#shareFallback')).toBeVisible();
  await expect(page.locator('#shareFallback')).toHaveValue(/《今天不加班》/);
});

test('campaign selector locks later levels, preserves a running session, and persists unlocks', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('[data-mode="daily"]')).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-mode="campaign"]').click();

  await expect(page.locator('#campaignSelect')).toBeVisible();
  const cards = page.locator('.level-card');
  await expect(cards).toHaveCount(5);
  await expect(cards.nth(0)).toBeEnabled();
  await expect(cards.nth(1)).toBeDisabled();
  await expect(cards.nth(0)).toContainText('新人演习');
  await expect(cards.nth(1)).toContainText('尚未解锁');

  await cards.nth(0).click();
  const firstSolution = await getSolution(page);
  await page.keyboard.press(keyByAction[firstSolution[0]!]);
  await expect(page.locator('#turnValue')).toHaveText('29');
  await page.locator('[data-mode="daily"]').click();
  await page.locator('[data-mode="campaign"]').click();
  await expect(page.locator('#turnValue')).toHaveText('29');

  await page.getByRole('button', { name: '重玩本关' }).click();
  const solution = await solveCurrentChallenge(page);
  await expect(page.locator('#resultTitle')).toHaveText('新人演习完成！');
  await expect(page.locator('#resultStats')).toContainText(`${solution.length}`);
  await expect(page.getByRole('button', { name: '下一关', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制战绩' })).toHaveCount(0);
  await page.locator('#resultSecondaryButton').click();

  await expect(cards.nth(0)).toContainText('已通关');
  await expect(cards.nth(1)).toBeEnabled();
  await expect(cards.nth(1)).toContainText('可以挑战');

  await page.reload();
  await expect(page.locator('[data-mode="daily"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#turnValue')).toHaveText('30');
  await page.locator('[data-mode="campaign"]').click();
  await expect(cards.nth(0)).toContainText('已通关');
  await expect(cards.nth(1)).toBeEnabled();
});

test('all five campaign levels unlock in order and end with the campaign finale', async ({ page }) => {
  await openGame(page);
  await page.locator('[data-mode="campaign"]').click();
  await page.locator('.level-card').first().click();

  for (let levelNumber = 1; levelNumber <= 5; levelNumber += 1) {
    await solveCurrentChallenge(page);
    const activeLevelNumber = await page.evaluate(() => {
      const challenge = window.__NO_OVERTIME_DEBUG__?.getChallenge();
      return challenge?.mode === 'campaign' ? challenge.levelNumber : null;
    });
    expect(activeLevelNumber).toBe(levelNumber);

    if (levelNumber < 5) {
      await expect(page.locator('#resultMessage')).toContainText('已经解锁');
      await page.getByRole('button', { name: '下一关', exact: true }).click();
    }
  }

  await expect(page.locator('#resultKicker')).toHaveText('CAMPAIGN CLEAR');
  await expect(page.locator('#resultTitle')).toHaveText('五关全部通关！');
  await expect(page.locator('#resultStats')).toContainText('5/5');
  await expect(page.getByRole('button', { name: '再玩本关', exact: true })).toBeVisible();
  await page.locator('#resultPrimaryButton').click();
  await expect(page.locator('.level-card.completed')).toHaveCount(5);
  await expect(page.locator('#campaignProgress')).toHaveText('5 / 5');

  await page.reload();
  await page.locator('[data-mode="campaign"]').click();
  await expect(page.locator('.level-card.completed')).toHaveCount(5);
});
