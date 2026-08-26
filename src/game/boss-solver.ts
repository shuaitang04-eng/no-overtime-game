import { applyBossAction, createInitialBossState } from './boss-logic';
import type { BossAction, BossChallengeDefinition, BossGameState } from './types';

const actions: BossAction[] = ['advance', 'reverse', 'hold'];

interface SearchNode {
  state: BossGameState;
  path: BossAction[];
}

function stateKey(state: BossGameState): string {
  return [
    state.employee.x,
    state.employee.y,
    state.employeeFacing,
    state.bossIndex,
    state.bossDirection,
    state.turn,
    state.catches,
    Number(state.employeeHasCard),
    state.holdsRemaining,
    state.reversalsRemaining,
    state.reverseCooldown,
    state.status,
    state.winReason ?? '',
  ].join('|');
}

function search(
  challenge: BossChallengeDefinition,
  isGoal: (state: BossGameState) => boolean,
): BossAction[] | null {
  const initial = createInitialBossState(challenge);
  const queue: SearchNode[] = [{ state: initial, path: [] }];
  const visited = new Set<string>([stateKey(initial)]);
  let cursor = 0;

  while (cursor < queue.length) {
    const node = queue[cursor]!;
    cursor += 1;
    if (node.path.length >= challenge.turnLimit || node.state.status !== 'playing') continue;

    for (const action of actions) {
      const transition = applyBossAction(challenge, node.state, action);
      if (transition.state === node.state) continue;
      const path = [...node.path, action];
      if (isGoal(transition.state)) return path;
      if (transition.state.status !== 'playing') continue;
      const key = stateKey(transition.state);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ state: transition.state, path });
      }
    }
  }
  return null;
}

export function findBossCapturePlan(
  challenge: BossChallengeDefinition,
): BossAction[] | null {
  return search(
    challenge,
    (state) => state.status === 'boss-won' && state.winReason === 'caught',
  );
}

export function findEmployeeEscapePlan(
  challenge: BossChallengeDefinition,
): BossAction[] | null {
  return search(challenge, (state) => state.status === 'employee-escaped');
}
