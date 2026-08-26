import type { ChallengeDefinition, Direction, GameState, Point } from './game/types';
import { pointKey, pointsEqual } from './game/types';
import {
  getActiveCleaningCart,
  getBossFacing,
  getBossPoint,
  getCurrentVision,
  getNextBossState,
  getNextVision,
} from './game/vision';

export const TILE_SIZE = 16;

const palette = {
  floorA: '#252442',
  floorB: '#292746',
  grout: '#343150',
  wall: '#111225',
  wallTop: '#454160',
  desk: '#996b4c',
  deskTop: '#d19a66',
  monitor: '#5de4c7',
  plant: '#49b86e',
  plantDark: '#247347',
  pot: '#d76c58',
  player: '#4fd8c8',
  playerDark: '#1d6570',
  boss: '#e14f62',
  bossDark: '#7f2943',
  skin: '#f3c18b',
  hair: '#332538',
  white: '#fff4de',
  card: '#ffd866',
  elevator: '#9a78f0',
  elevatorDark: '#55408b',
  cart: '#77c7f2',
};

function tileOrigin(point: Point): Point {
  return { x: point.x * TILE_SIZE, y: point.y * TILE_SIZE };
}

function drawFloor(context: CanvasRenderingContext2D, point: Point): void {
  const origin = tileOrigin(point);
  context.fillStyle = (point.x + point.y) % 2 === 0 ? palette.floorA : palette.floorB;
  context.fillRect(origin.x, origin.y, TILE_SIZE, TILE_SIZE);
  context.fillStyle = palette.grout;
  context.fillRect(origin.x + 15, origin.y, 1, TILE_SIZE);
  context.fillRect(origin.x, origin.y + 15, TILE_SIZE, 1);
}

function drawWall(context: CanvasRenderingContext2D, point: Point): void {
  const origin = tileOrigin(point);
  context.fillStyle = palette.wall;
  context.fillRect(origin.x, origin.y, TILE_SIZE, TILE_SIZE);
  context.fillStyle = palette.wallTop;
  context.fillRect(origin.x, origin.y, TILE_SIZE, 3);
  context.fillStyle = '#272944';
  context.fillRect(origin.x + ((point.y % 2) * 4), origin.y + 7, 8, 1);
  context.fillRect(origin.x + 8 - ((point.y % 2) * 4), origin.y + 12, 8, 1);
}

function drawDesk(context: CanvasRenderingContext2D, point: Point): void {
  const origin = tileOrigin(point);
  drawFloor(context, point);
  context.fillStyle = palette.desk;
  context.fillRect(origin.x + 1, origin.y + 5, 14, 9);
  context.fillStyle = palette.deskTop;
  context.fillRect(origin.x + 1, origin.y + 4, 14, 3);
  context.fillStyle = '#1a203d';
  context.fillRect(origin.x + 5, origin.y + 1, 7, 5);
  context.fillStyle = palette.monitor;
  context.fillRect(origin.x + 6, origin.y + 2, 5, 2);
  context.fillStyle = '#68462f';
  context.fillRect(origin.x + 3, origin.y + 13, 2, 3);
  context.fillRect(origin.x + 11, origin.y + 13, 2, 3);
}

function drawPlant(context: CanvasRenderingContext2D, point: Point): void {
  const origin = tileOrigin(point);
  drawFloor(context, point);
  context.fillStyle = palette.plantDark;
  context.fillRect(origin.x + 7, origin.y + 4, 2, 7);
  context.fillStyle = palette.plant;
  context.fillRect(origin.x + 4, origin.y + 3, 4, 4);
  context.fillRect(origin.x + 8, origin.y + 1, 4, 5);
  context.fillRect(origin.x + 9, origin.y + 6, 4, 3);
  context.fillStyle = palette.pot;
  context.fillRect(origin.x + 5, origin.y + 10, 7, 4);
  context.fillStyle = '#8a3940';
  context.fillRect(origin.x + 6, origin.y + 14, 5, 1);
}

function drawVision(
  context: CanvasRenderingContext2D,
  cells: Point[],
  color: string,
  alpha: number,
  inset: number,
): void {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  for (const point of cells) {
    const origin = tileOrigin(point);
    context.fillRect(
      origin.x + inset,
      origin.y + inset,
      TILE_SIZE - inset * 2,
      TILE_SIZE - inset * 2,
    );
  }
  context.restore();
}

function drawStartMarker(context: CanvasRenderingContext2D, point: Point): void {
  const origin = tileOrigin(point);
  context.fillStyle = '#514d72';
  context.fillRect(origin.x + 3, origin.y + 12, 10, 2);
  context.fillStyle = '#827ca8';
  context.fillRect(origin.x + 4, origin.y + 13, 8, 1);
}

function drawElevator(
  context: CanvasRenderingContext2D,
  point: Point,
  unlocked: boolean,
): void {
  const origin = tileOrigin(point);
  context.fillStyle = palette.elevatorDark;
  context.fillRect(origin.x + 2, origin.y + 1, 12, 14);
  context.fillStyle = palette.elevator;
  context.fillRect(origin.x + 3, origin.y + 2, 10, 12);
  context.fillStyle = '#292743';
  context.fillRect(origin.x + 7, origin.y + 2, 2, 12);
  context.fillStyle = unlocked ? palette.card : palette.boss;
  context.fillRect(origin.x + 12, origin.y + 5, 2, 3);
  context.fillStyle = palette.white;
  context.fillRect(origin.x + 5, origin.y + 4, 1, 1);
  context.fillRect(origin.x + 10, origin.y + 4, 1, 1);
}

function drawCard(context: CanvasRenderingContext2D, point: Point): void {
  const origin = tileOrigin(point);
  context.fillStyle = '#9c6f2d';
  context.fillRect(origin.x + 3, origin.y + 5, 11, 7);
  context.fillStyle = palette.card;
  context.fillRect(origin.x + 2, origin.y + 4, 11, 7);
  context.fillStyle = '#f08a5d';
  context.fillRect(origin.x + 4, origin.y + 6, 3, 3);
  context.fillStyle = '#805b40';
  context.fillRect(origin.x + 8, origin.y + 6, 3, 1);
  context.fillRect(origin.x + 8, origin.y + 8, 2, 1);
}

function drawCart(context: CanvasRenderingContext2D, point: Point): void {
  const origin = tileOrigin(point);
  context.fillStyle = '#31516b';
  context.fillRect(origin.x + 2, origin.y + 6, 12, 7);
  context.fillStyle = palette.cart;
  context.fillRect(origin.x + 3, origin.y + 5, 10, 6);
  context.fillStyle = palette.white;
  context.fillRect(origin.x + 5, origin.y + 2, 6, 4);
  context.fillStyle = '#182038';
  context.fillRect(origin.x + 3, origin.y + 13, 3, 2);
  context.fillRect(origin.x + 10, origin.y + 13, 3, 2);
}

function drawPerson(
  context: CanvasRenderingContext2D,
  point: Point,
  facing: Direction,
  role: 'player' | 'boss',
): void {
  const origin = tileOrigin(point);
  const body = role === 'player' ? palette.player : palette.boss;
  const dark = role === 'player' ? palette.playerDark : palette.bossDark;
  const faceShift = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;

  context.fillStyle = '#17152d';
  context.fillRect(origin.x + 5, origin.y + 14, 3, 2);
  context.fillRect(origin.x + 9, origin.y + 14, 3, 2);
  context.fillStyle = dark;
  context.fillRect(origin.x + 4, origin.y + 8, 9, 7);
  context.fillStyle = body;
  context.fillRect(origin.x + 5, origin.y + 7, 7, 7);
  context.fillStyle = palette.skin;
  context.fillRect(origin.x + 5, origin.y + 2, 7, 6);
  context.fillStyle = palette.hair;
  context.fillRect(origin.x + 5, origin.y + 1, 7, 3);
  context.fillRect(origin.x + 4, origin.y + 2, 2, 4);
  context.fillStyle = '#24192b';
  context.fillRect(origin.x + 7 + faceShift, origin.y + 5, 1, 1);
  context.fillRect(origin.x + 10 + faceShift, origin.y + 5, 1, 1);
  if (role === 'boss') {
    context.fillStyle = palette.white;
    context.fillRect(origin.x + 7, origin.y + 8, 3, 3);
    context.fillStyle = '#2e2340';
    context.fillRect(origin.x + 8, origin.y + 9, 1, 4);
  } else {
    context.fillStyle = palette.card;
    context.fillRect(origin.x + 5, origin.y + 10, 2, 2);
  }
}

export function renderBoard(
  canvas: HTMLCanvasElement,
  challenge: ChallengeDefinition,
  state: GameState,
  playerFacing: Direction,
): void {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < challenge.height; y += 1) {
    for (let x = 0; x < challenge.width; x += 1) {
      const point = { x, y };
      const tile = challenge.tiles[y]?.[x];
      if (tile === '#') {
        drawWall(context, point);
      } else if (tile === 'D') {
        drawDesk(context, point);
      } else if (tile === 'P') {
        drawPlant(context, point);
      } else {
        drawFloor(context, point);
      }
    }
  }

  drawVision(context, getNextVision(challenge, state), '#f5bd5b', 0.18, 2);
  drawVision(context, getCurrentVision(challenge, state), '#ff5364', 0.34, 0);
  drawStartMarker(context, challenge.start);
  drawElevator(context, challenge.exit, state.hasCard);
  if (!state.hasCard) {
    drawCard(context, challenge.card);
  }

  const cart = getActiveCleaningCart(challenge, state.turn);
  if (cart) {
    drawCart(context, cart);
  }

  const boss = getBossPoint(challenge, state.bossIndex);
  drawPerson(
    context,
    boss,
    getBossFacing(challenge, state.bossIndex, state.bossDirection),
    'boss',
  );
  drawPerson(context, state.player, playerFacing, 'player');

  if (state.suspicion > 0 && state.status === 'playing') {
    const origin = tileOrigin(state.player);
    context.fillStyle = palette.white;
    context.fillRect(origin.x + 11, origin.y, 4, 6);
    context.fillStyle = palette.boss;
    context.fillRect(origin.x + 12, origin.y + 1, 2, 3);
    context.fillRect(origin.x + 12, origin.y + 5, 2, 1);
  }

  const nextBoss = getNextBossState(challenge, state);
  const nextBossPoint = getBossPoint(challenge, nextBoss.bossIndex);
  if (!pointsEqual(nextBossPoint, boss)) {
    const origin = tileOrigin(nextBossPoint);
    context.strokeStyle = '#f5bd5b';
    context.lineWidth = 1;
    context.setLineDash([2, 2]);
    context.strokeRect(origin.x + 2.5, origin.y + 2.5, 11, 11);
    context.setLineDash([]);
  }

  canvas.dataset.player = pointKey(state.player);
  canvas.dataset.boss = pointKey(boss);
}
