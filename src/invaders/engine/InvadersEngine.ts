import { Emitter } from '../../core/events';
import { mulberry32 } from '../../core/Rng';
import type { Rng } from '../../core/Rng';
import type { InvadersEvent } from './events';

export const STEP_MS = 1000 / 60;
export const FIELD_W = 480;
export const FIELD_H = 800;
export const PLAYER_Y = 742;
export const PLAYER_HALF = 26;
export const MUTANT_HALF = 22;

const PLAYER_MIN_X = 30;
const PLAYER_MAX_X = FIELD_W - 30;
const EDGE_MARGIN = 34;
const BULLET_SPEED = 620; // px/s upward
const BULLET_HALF = 10;
const MAX_TICK_MS = 250;
const GAP_X = 54;
const GAP_Y = 48;
const ORIGIN_Y = 96;
/** Formation loses ground when it reaches this line — the build is overrun. */
const LOSE_LINE = PLAYER_Y - 40;

export interface InvadersConfig {
  cols: number;
  rows: number;
  /** Base horizontal formation speed (px/s); it accelerates as mutants die. */
  formationSpeed: number;
  descend: number;
  fireIntervalMs: number;
  bombIntervalMs: number;
  bombSpeed: number;
  integrity: number;
  seed: number;
}

export type Phase = 'running' | 'won' | 'lost';

export interface MutantView {
  id: number;
  x: number;
  y: number;
  design: number;
}
export interface ShotView {
  id: number;
  x: number;
  y: number;
}
export interface InvadersState {
  mutants: MutantView[];
  bullets: ShotView[];
  bombs: ShotView[];
  playerX: number;
  integrity: number;
  score: number;
  kills: number;
  totalMutants: number;
  phase: Phase;
}

interface Mutant {
  id: number;
  col: number;
  row: number;
  design: number;
  alive: boolean;
}

export class InvadersEngine {
  private readonly emitter = new Emitter<InvadersEvent>();
  private readonly rng: Rng;
  private readonly mutants: Mutant[] = [];
  private bullets: { id: number; x: number; y: number }[] = [];
  private bombs: { id: number; x: number; y: number }[] = [];
  private readonly originX: number;

  private formationX = 0;
  private formationY = 0;
  private dir = 1;
  private phase: Phase = 'running';
  private integrity: number;
  private score = 0;
  private kills = 0;
  private playerX = FIELD_W / 2;
  private fireTimer = 0;
  private bombTimer = 0;
  private acc = 0;
  private nextId = 1;
  private readonly total: number;

  constructor(private readonly config: InvadersConfig) {
    this.rng = mulberry32(config.seed);
    this.integrity = config.integrity;
    const formationWidth = (config.cols - 1) * GAP_X;
    this.originX = (FIELD_W - formationWidth) / 2;
    let design = 0;
    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        this.mutants.push({ id: this.nextId++, col, row, design: design++ % 6, alive: true });
      }
    }
    this.total = this.mutants.length;
  }

  on<T extends InvadersEvent['type']>(
    type: T,
    fn: (e: Extract<InvadersEvent, { type: T }>) => void,
  ): () => void {
    return this.emitter.on(type, fn);
  }

  /** From touch drag / arrow keys; clamped to the play area. */
  setPlayerX(x: number): void {
    this.playerX = Math.max(PLAYER_MIN_X, Math.min(PLAYER_MAX_X, x));
  }

  movePlayer(dx: number): void {
    this.setPlayerX(this.playerX + dx);
  }

  tick(deltaMs: number): void {
    if (this.phase !== 'running') return;
    this.acc += Math.min(deltaMs, MAX_TICK_MS);
    while (this.acc >= STEP_MS && this.phase === 'running') {
      this.step();
      this.acc -= STEP_MS;
    }
  }

  snapshot(): InvadersState {
    return {
      mutants: this.mutants
        .filter((m) => m.alive)
        .map((m) => ({ id: m.id, x: this.mx(m), y: this.my(m), design: m.design })),
      bullets: this.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y })),
      bombs: this.bombs.map((b) => ({ id: b.id, x: b.x, y: b.y })),
      playerX: this.playerX,
      integrity: this.integrity,
      score: this.score,
      kills: this.kills,
      totalMutants: this.total,
      phase: this.phase,
    };
  }

  private mx(m: Mutant): number {
    return this.originX + m.col * GAP_X + this.formationX;
  }
  private my(m: Mutant): number {
    return ORIGIN_Y + m.row * GAP_Y + this.formationY;
  }

  private step(): void {
    const dt = STEP_MS / 1000;
    this.stepFormation(dt);
    this.stepFire();
    this.stepBombs(dt);
    this.stepBullets(dt);
    this.checkEnd();
  }

  private stepFormation(dt: number): void {
    const alive = this.mutants.filter((m) => m.alive);
    if (alive.length === 0) return;
    const deadFrac = 1 - alive.length / this.total;
    const speed = this.config.formationSpeed * (1 + deadFrac * 1.8);
    this.formationX += this.dir * speed * dt;

    let left = Infinity;
    let right = -Infinity;
    for (const m of alive) {
      const x = this.mx(m);
      if (x < left) left = x;
      if (x > right) right = x;
    }
    if (this.dir > 0 && right >= FIELD_W - EDGE_MARGIN) {
      this.dir = -1;
      this.descend();
    } else if (this.dir < 0 && left <= EDGE_MARGIN) {
      this.dir = 1;
      this.descend();
    }
  }

  private descend(): void {
    this.formationY += this.config.descend;
    this.emitter.emit({ type: 'descend' });
  }

  private stepFire(): void {
    this.fireTimer += STEP_MS;
    if (this.fireTimer < this.config.fireIntervalMs) return;
    this.fireTimer = 0;
    const y = PLAYER_Y - 26;
    const bullet = { id: this.nextId++, x: this.playerX, y };
    this.bullets.push(bullet);
    this.emitter.emit({ type: 'shoot', x: bullet.x, y });
  }

  private stepBullets(dt: number): void {
    const survivors: typeof this.bullets = [];
    for (const b of this.bullets) {
      b.y -= BULLET_SPEED * dt;
      if (b.y < -20) continue;
      const hit = this.mutants.find(
        (m) =>
          m.alive &&
          Math.abs(this.mx(m) - b.x) < MUTANT_HALF + BULLET_HALF &&
          Math.abs(this.my(m) - b.y) < MUTANT_HALF + BULLET_HALF,
      );
      if (hit) {
        hit.alive = false;
        this.kills++;
        this.score += 100;
        this.emitter.emit({ type: 'mutantKilled', id: hit.id, x: this.mx(hit), y: this.my(hit), design: hit.design });
        continue; // bullet consumed
      }
      survivors.push(b);
    }
    this.bullets = survivors;
  }

  private stepBombs(dt: number): void {
    this.bombTimer += STEP_MS;
    const alive = this.mutants.filter((m) => m.alive);
    if (alive.length > 0 && this.bombTimer >= this.config.bombIntervalMs) {
      this.bombTimer = 0;
      // Prefer the front-most mutant in a random column so bombs come from the
      // bottom edge of the formation, like real Space Invaders.
      const shooter = alive[Math.floor(this.rng() * alive.length)];
      if (shooter) {
        const bomb = { id: this.nextId++, x: this.mx(shooter), y: this.my(shooter) + MUTANT_HALF };
        this.bombs.push(bomb);
        this.emitter.emit({ type: 'bombDrop', id: bomb.id, x: bomb.x, y: bomb.y });
      }
    }
    const survivors: typeof this.bombs = [];
    for (const b of this.bombs) {
      b.y += this.config.bombSpeed * dt;
      if (b.y > FIELD_H + 20) continue;
      if (Math.abs(b.x - this.playerX) < PLAYER_HALF && Math.abs(b.y - PLAYER_Y) < 22) {
        this.integrity--;
        this.emitter.emit({ type: 'playerHit', integrityLeft: this.integrity });
        continue;
      }
      survivors.push(b);
    }
    this.bombs = survivors;
  }

  private checkEnd(): void {
    if (this.integrity <= 0) {
      this.phase = 'lost';
      this.emitter.emit({ type: 'levelLost' });
      return;
    }
    const alive = this.mutants.filter((m) => m.alive);
    if (alive.length === 0) {
      this.phase = 'won';
      this.emitter.emit({ type: 'levelWon' });
      return;
    }
    for (const m of alive) {
      if (this.my(m) + MUTANT_HALF >= LOSE_LINE) {
        this.phase = 'lost';
        this.emitter.emit({ type: 'levelLost' });
        return;
      }
    }
  }
}
