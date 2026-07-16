export type InvadersEvent =
  | { type: 'shoot'; x: number; y: number }
  | { type: 'mutantKilled'; id: number; x: number; y: number; design: number }
  | { type: 'bombDrop'; id: number; x: number; y: number }
  | { type: 'playerHit'; integrityLeft: number }
  | { type: 'descend' }
  | { type: 'levelWon' }
  | { type: 'levelLost' };
