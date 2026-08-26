import type { Point } from './types';

export interface LayoutTemplate {
  id: string;
  tiles: string[];
  starts: Point[];
  exits: Point[];
  cards: Point[];
  carts: Point[];
  bossPath: Point[];
}

const perimeterPath: Point[] = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 3, y: 1 },
  { x: 4, y: 1 },
  { x: 5, y: 1 },
  { x: 6, y: 1 },
  { x: 7, y: 1 },
  { x: 8, y: 1 },
  { x: 8, y: 2 },
  { x: 8, y: 3 },
  { x: 8, y: 4 },
  { x: 8, y: 5 },
  { x: 8, y: 6 },
  { x: 7, y: 6 },
  { x: 6, y: 6 },
  { x: 5, y: 6 },
  { x: 4, y: 6 },
  { x: 3, y: 6 },
  { x: 2, y: 6 },
  { x: 1, y: 6 },
  { x: 1, y: 5 },
  { x: 1, y: 4 },
  { x: 1, y: 3 },
  { x: 1, y: 2 },
];

const commonExits: Point[] = [
  { x: 8, y: 1 },
  { x: 1, y: 6 },
];

const commonCards: Point[] = [
  { x: 1, y: 1 },
  { x: 8, y: 6 },
  { x: 4, y: 1 },
  { x: 5, y: 6 },
  { x: 1, y: 3 },
  { x: 8, y: 4 },
];

export const LAYOUTS: LayoutTemplate[] = [
  {
    id: 'open-plan',
    tiles: [
      '##########',
      '#........#',
      '#.DD..DD.#',
      '#........#',
      '#..P..P..#',
      '#.DD..DD.#',
      '#........#',
      '##########',
    ],
    starts: [
      { x: 4, y: 3 },
      { x: 5, y: 3 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ],
    exits: commonExits,
    cards: commonCards,
    carts: [
      { x: 2, y: 3 },
      { x: 7, y: 3 },
      { x: 4, y: 5 },
      { x: 5, y: 2 },
    ],
    bossPath: perimeterPath,
  },
  {
    id: 'cubicle-maze',
    tiles: [
      '##########',
      '#........#',
      '#.D.D.D..#',
      '#.D.D.D..#',
      '#..D.D.D.#',
      '#..D.D.D.#',
      '#........#',
      '##########',
    ],
    starts: [
      { x: 2, y: 4 },
      { x: 7, y: 3 },
      { x: 3, y: 3 },
      { x: 6, y: 4 },
    ],
    exits: commonExits,
    cards: commonCards,
    carts: [
      { x: 2, y: 3 },
      { x: 7, y: 4 },
      { x: 4, y: 4 },
      { x: 5, y: 3 },
    ],
    bossPath: perimeterPath,
  },
  {
    id: 'corner-offices',
    tiles: [
      '##########',
      '#........#',
      '#..DDD...#',
      '#..D.....#',
      '#.....D..#',
      '#...DDD..#',
      '#........#',
      '##########',
    ],
    starts: [
      { x: 2, y: 4 },
      { x: 7, y: 3 },
      { x: 4, y: 4 },
      { x: 5, y: 3 },
    ],
    exits: commonExits,
    cards: commonCards,
    carts: [
      { x: 2, y: 3 },
      { x: 7, y: 4 },
      { x: 4, y: 3 },
      { x: 5, y: 4 },
    ],
    bossPath: perimeterPath,
  },
  {
    id: 'diagonal-desks',
    tiles: [
      '##########',
      '#........#',
      '#.DD.....#',
      '#....DD..#',
      '#..DD....#',
      '#.....DD.#',
      '#........#',
      '##########',
    ],
    starts: [
      { x: 4, y: 2 },
      { x: 5, y: 5 },
      { x: 2, y: 3 },
      { x: 7, y: 4 },
    ],
    exits: commonExits,
    cards: commonCards,
    carts: [
      { x: 3, y: 3 },
      { x: 6, y: 4 },
      { x: 4, y: 5 },
      { x: 5, y: 2 },
    ],
    bossPath: perimeterPath,
  },
];
