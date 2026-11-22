/**
 * Deterministic, serializable PRNG (Mulberry32) seeded from any string.
 * Enables exact replay across saves, procedural layouts, and server-authoritative multiplayer.
 */

export function hashSeedString(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 0x9e3779b9;
}

export class SeededRng {
  private state: number;

  constructor(stateOrSeed: number | string) {
    this.state =
      typeof stateOrSeed === 'string'
        ? hashSeedString(stateOrSeed)
        : (stateOrSeed >>> 0) || 0x9e3779b9;
  }

  getState(): number {
    return this.state >>> 0;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  rollD6(): number {
    return this.int(1, 6);
  }

  roll2d6(): [number, number] {
    return [this.rollD6(), this.rollD6()];
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  weightedPick<T>(items: readonly T[], weightFn: (item: T) => number): T {
    let total = 0;
    const weights = items.map((item) => {
      const w = Math.max(0, weightFn(item));
      total += w;
      return w;
    });
    if (total <= 0) {
      return items[0];
    }
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        return items[i];
      }
    }
    return items[items.length - 1];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export function generateReadableSeed(): string {
  const words = [
    'ALDER',
    'BRIAR',
    'CHIME',
    'DUSK',
    'EMBER',
    'GARNET',
    'HOLLOW',
    'IVORY',
    'LANTERN',
    'MANTEL',
    'NOCTURNE',
    'PENDULUM',
    'RAVINE',
    'SHROUD',
    'VELVET',
    'WICK',
  ];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(100 + Math.random() * 899);
  return `${w1}-${w2}-${num}`;
}
