export class TargetLock {
  private id: string | null = null;

  get lockedId(): string | null {
    return this.id;
  }

  lock(id: string): void {
    this.id = id;
  }

  release(): void {
    this.id = null;
  }

  isLocked(id: string): boolean {
    return this.id === id;
  }
}
