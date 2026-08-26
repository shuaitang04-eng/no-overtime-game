import { applyAction, createInitialState } from './logic';
import type { ChallengeDefinition, GameAction, GameState } from './types';

const actions: GameAction[] = ['up', 'right', 'down', 'left', 'wait'];

interface SearchNode {
  state: GameState;
  path: GameAction[];
}

function stateKey(state: GameState): string {
  return [
    state.player.x,
    state.player.y,
    state.bossIndex,
    state.bossDirection,
    state.turn,
    state.suspicion,
    Number(state.hasCard),
    state.status,
  ].join('|');
}

export function findSolution(
  challenge: ChallengeDefinition,
  maxSuspicion = 0,
): GameAction[] | null {
  const initial = createInitialState(challenge);
  const queue: SearchNode[] = [{ state: initial, path: [] }];
  const visited = new Set<string>([stateKey(initial)]);
  let cursor = 0;

  while (cursor < queue.length) {
    const node = queue[cursor] as SearchNode;
    cursor += 1;
    if (node.path.length >= challenge.turnLimit) {
      continue;
    }

    for (const action of actions) {
      const result = applyAction(challenge, node.state, action);
      const next = result.state;
      if (next === node.state || next.suspicion > maxSuspicion || next.status === 'lost') {
        continue;
      }
      const path = [...node.path, action];
      if (next.status === 'won') {
        return path;
      }
      const key = stateKey(next);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ state: next, path });
      }
    }
  }
  return null;
}
