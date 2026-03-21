
export type Player = 'player1' | 'player2';

export type OpponentType = 'player' | 'cpu_easy' | 'cpu_normal' | 'cpu_hard';

export interface PieceData {
  player: Player;
  value: number;
  under: PieceData | null;
}

export type GameMode = 'place' | 'return';

export interface GameState {
  board: (PieceData | null)[];
  currentPlayer: Player;
  onBoardPieces: { [key in Player]: number[] };
  cooldown: { [key in Player]: number | null };
  status: 'start' | 'playing' | 'winner' | 'confirm';
  winner: Player | null;
  selectedPieceValue: number | null;
  mode: GameMode;
  hasRecoveredThisTurn: boolean; // この手番で既に回収アクションを行ったか
  opponentType: OpponentType;
}
