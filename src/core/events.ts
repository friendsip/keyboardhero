export interface EnemySnapshot {
  id: string;
  type: string;
  /** Lateral position across the rail, -1 (far left) .. 1 (far right). */
  lateral: number;
  /** Depth in z-units: SPAWN_Z when spawned, ATTACK_Z when it strikes. */
  z: number;
  word: string;
  progress: number;
  locked: boolean;
}

export type EngineEvent =
  | { type: 'spawn'; enemy: EnemySnapshot }
  | { type: 'segmentStart'; index: number; kind: 'travel' | 'encounter'; label?: string }
  | { type: 'lock'; enemyId: string }
  | { type: 'hit'; enemyId: string; letterIndex: number; char: string }
  | { type: 'miss'; expected: string | null; got: string }
  | { type: 'wordComplete'; enemyId: string; flawless: boolean; score: number }
  | { type: 'comboBreak'; was: number }
  | { type: 'coreDamage'; enemyId: string; integrityLeft: number }
  | { type: 'levelWon' }
  | { type: 'levelLost' };

type Handler<E> = (event: E) => void;

export class Emitter<E extends { type: string }> {
  private handlers = new Map<E['type'], Set<Handler<never>>>();

  on<T extends E['type']>(type: T, fn: Handler<Extract<E, { type: T }>>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => {
      set.delete(fn as Handler<never>);
    };
  }

  emit(event: E): void {
    const set = this.handlers.get(event.type as E['type']);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E>)(event);
  }
}
