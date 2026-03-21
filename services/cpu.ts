import { GameState, Player, PieceData, OpponentType } from '../types';

// 手持ちの駒のリストを取得
const getHandPieces = (player: Player, onBoard: number[]) => {
  const all = [1, 2, 3, 4, 5, 6];
  return all.filter(v => !onBoard.includes(v));
};

// 配置可能な場所と駒の組み合わせをすべて取得
const getPossiblePlacements = (player: Player, onBoard: number[], board: (PieceData | null)[]) => {
  const hand = getHandPieces(player, onBoard);
  const placements: { slotIndex: number, pieceValue: number }[] = [];

  for (const pieceValue of hand) {
    for (let slotIndex = 0; slotIndex < board.length; slotIndex++) {
      const slot = board[slotIndex];
      if (!slot || (slot.player !== player && pieceValue > slot.value)) {
        placements.push({ slotIndex, pieceValue });
      }
    }
  }
  return placements;
};

// 回収可能な駒をすべて取得
const getPossibleReturns = (player: Player, board: (PieceData | null)[]) => {
  const returns: number[] = [];
  for (let slotIndex = 0; slotIndex < board.length; slotIndex++) {
    const slot = board[slotIndex];
    if (slot && slot.player === player) {
      returns.push(slotIndex);
    }
  }
  return returns;
};

const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

// 勝利判定
const checkWin = (board: (PieceData | null)[], player: Player) => {
  return WIN_PATTERNS.some(pat => pat.every(idx => board[idx]?.player === player));
};

// 次の手で勝てる配置があるか探す
const findWinningPlacement = (player: Player, onBoard: number[], board: (PieceData | null)[]) => {
  const placements = getPossiblePlacements(player, onBoard, board);
  for (const p of placements) {
    const newBoard = [...board];
    newBoard[p.slotIndex] = { player, value: p.pieceValue, under: board[p.slotIndex] };
    if (checkWin(newBoard, player)) {
      return p;
    }
  }
  return null;
};

// 次の手で勝てる配置をすべて探す
const findAllWinningPlacements = (player: Player, onBoard: number[], board: (PieceData | null)[]) => {
  const placements = getPossiblePlacements(player, onBoard, board);
  const winningPlacements = [];
  for (const p of placements) {
    const newBoard = [...board];
    newBoard[p.slotIndex] = { player, value: p.pieceValue, under: board[p.slotIndex] };
    if (checkWin(newBoard, player)) {
      winningPlacements.push(p);
    }
  }
  return winningPlacements;
};

// CPUの思考ルーチン
export const calculateCPUMove = (gameState: GameState): { action: 'place' | 'return', slotIndex: number, pieceValue?: number } | null => {
  const { board, currentPlayer, onBoardPieces, mode, opponentType } = gameState;
  const onBoard = onBoardPieces[currentPlayer];
  const opponent: Player = currentPlayer === 'player1' ? 'player2' : 'player1';
  const opponentOnBoard = onBoardPieces[opponent];

  if (mode === 'place') {
    const placements = getPossiblePlacements(currentPlayer, onBoard, board);
    if (placements.length === 0) return null; // 配置不可

    // 1. 自分が勝てる手があれば選ぶ (全難易度共通)
    const winMove = findWinningPlacement(currentPlayer, onBoard, board);
    if (winMove) return { action: 'place', ...winMove };

    // 2. 相手が次に勝てる手があれば防ぐ (全難易度共通)
    const opponentWinningPlacements = findAllWinningPlacements(opponent, opponentOnBoard, board);
    if (opponentWinningPlacements.length > 0) {
      const winningSlots = Array.from(new Set(opponentWinningPlacements.map(p => p.slotIndex)));
      const opponentHand = getHandPieces(opponent, opponentOnBoard);
      const opponentMaxPiece = opponentHand.length > 0 ? Math.max(...opponentHand) : 0;

      let validBlockPlacements: { slotIndex: number, pieceValue: number }[] = [];

      // 相手のリーチラインを特定
      const winningLines = WIN_PATTERNS.filter(pat => {
        const opponentCount = pat.filter(idx => board[idx]?.player === opponent).length;
        const canPlaceCount = pat.filter(idx => winningSlots.includes(idx)).length;
        return opponentCount === 2 && canPlaceCount === 1;
      });

      let targetCoverSlots: number[] = [];
      if (winningLines.length > 1) {
        // ダブルリーチ以上の場合、共通する相手の駒を探す
        const opponentPieceSlots = winningLines[0].filter(idx => board[idx]?.player === opponent);
        for (const slot of opponentPieceSlots) {
          if (winningLines.every(line => line.includes(slot))) {
            targetCoverSlots.push(slot);
          }
        }
      } else if (winningLines.length === 1) {
        targetCoverSlots = winningLines[0].filter(idx => board[idx]?.player === opponent);
      }

      // 方法A: 勝利マスを直接埋める
      for (const slot of winningSlots) {
        if (opponentType === 'cpu_hard') {
          // 上級：相手の最大駒より大きい駒で埋める（上書きされないため）
          validBlockPlacements.push(...placements.filter(p => p.slotIndex === slot && p.pieceValue > opponentMaxPiece));
        } else {
          // 初級・中級：とりあえず埋める
          validBlockPlacements.push(...placements.filter(p => p.slotIndex === slot));
        }
      }

      // 方法B: 相手のリーチ構成駒を上書きする (中級・上級)
      if (opponentType === 'cpu_normal' || opponentType === 'cpu_hard') {
        for (const slot of targetCoverSlots) {
          validBlockPlacements.push(...placements.filter(p => p.slotIndex === slot));
        }
      }

      if (validBlockPlacements.length > 0) {
        // 有効な防ぎ方の中で、なるべく小さい駒を使う
        validBlockPlacements.sort((a, b) => a.pieceValue - b.pieceValue);
        return { action: 'place', ...validBlockPlacements[0] };
      }

      // 有効な防ぎ方がない場合（上級で相手の最大駒より大きい駒がない、かつ上書きもできない場合など）
      // とりあえず最初の勝利マスを最大の駒で埋めて悪あがき
      const fallbackPlacements = placements.filter(p => p.slotIndex === winningSlots[0]);
      if (fallbackPlacements.length > 0) {
        fallbackPlacements.sort((a, b) => b.pieceValue - a.pieceValue);
        return { action: 'place', ...fallbackPlacements[0] };
      }
    }

    if (opponentType === 'cpu_easy') {
      // 初級：勝ちとブロック以外は完全にランダム
      const randomPlacement = placements[Math.floor(Math.random() * placements.length)];
      return { action: 'place', ...randomPlacement };
    }

    if (opponentType === 'cpu_normal' || opponentType === 'cpu_hard') {
      // 上級の場合は、より良い手を選ぶ（簡易ヒューリスティック）
      if (opponentType === 'cpu_hard') {
        // 中央(4)を取れるなら取る
        const centerPlacements = placements.filter(p => p.slotIndex === 4);
        if (centerPlacements.length > 0) {
          centerPlacements.sort((a, b) => a.pieceValue - b.pieceValue);
          return { action: 'place', ...centerPlacements[0] };
        }
        
        // なるべく小さい数字を使う
        placements.sort((a, b) => a.pieceValue - b.pieceValue);
        // 同じ数字なら、角(0,2,6,8)を優先
        const corners = [0, 2, 6, 8];
        const bestPlacements = placements.filter(p => p.pieceValue === placements[0].pieceValue);
        const cornerPlacements = bestPlacements.filter(p => corners.includes(p.slotIndex));
        if (cornerPlacements.length > 0) {
          return { action: 'place', ...cornerPlacements[Math.floor(Math.random() * cornerPlacements.length)] };
        }
        return { action: 'place', ...bestPlacements[Math.floor(Math.random() * bestPlacements.length)] };
      }

      // 中級：なるべく小さい数字を温存して使う
      placements.sort((a, b) => a.pieceValue - b.pieceValue);
      const bestPlacements = placements.filter(p => p.pieceValue === placements[0].pieceValue);
      return { action: 'place', ...bestPlacements[Math.floor(Math.random() * bestPlacements.length)] };
    }
  } else if (mode === 'return') {
    const returns = getPossibleReturns(currentPlayer, board);
    if (returns.length === 0) return null; // 回収不可

    // 回収はランダムに選ぶ（上級でも回収の完全読みは難しいため簡易化）
    // ただし、相手のリーチを作らないようにするなどの工夫は可能だが、今回はランダム
    const randomReturn = returns[Math.floor(Math.random() * returns.length)];
    return { action: 'return', slotIndex: randomReturn };
  }

  return null;
};
