
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Player, GameState, PieceData, GameMode, OpponentType } from './types';
import { ThreeScene } from './services/ThreeScene';
import { calculateCPUMove } from './services/cpu';
import { Volume2, VolumeX } from 'lucide-react';

const INITIAL_STATE: GameState = {
  board: Array(9).fill(null),
  currentPlayer: 'player1',
  onBoardPieces: { player1: [], player2: [] },
  cooldown: { player1: null, player2: null },
  status: 'start',
  winner: null,
  selectedPieceValue: null,
  mode: 'place',
  hasRecoveredThisTurn: false,
  opponentType: 'player',
};

const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export default function App() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [showRules, setShowRules] = useState(false);
  const [isBgmPlaying, setIsBgmPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ThreeScene | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      if (isBgmPlaying) {
        audioRef.current.play().catch(e => {
          console.error("BGM再生エラー:", e);
          setIsBgmPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isBgmPlaying]);

  // 手持ちの駒のリストを取得
  const getHandPieces = (player: Player, onBoard: number[]) => {
    const all = [1, 2, 3, 4, 5, 6];
    return all.filter(v => !onBoard.includes(v));
  };

  // 配置可能な場所があるかチェック
  const checkCanPlaceAny = (player: Player, onBoard: number[], board: (PieceData | null)[]) => {
    const hand = getHandPieces(player, onBoard);
    if (hand.length === 0) return false;

    for (const pieceVal of hand) {
      for (const slot of board) {
        if (!slot) return true; // 空きマスがあれば置ける
        if (slot.player !== player && pieceVal > slot.value) return true; // 相手のより大きければ置ける
      }
    }
    return false;
  };

  const isPlacementPossible = useMemo(() => {
    return checkCanPlaceAny(gameState.currentPlayer, gameState.onBoardPieces[gameState.currentPlayer], gameState.board);
  }, [gameState.currentPlayer, gameState.onBoardPieces, gameState.board]);

  const checkWin = (board: (PieceData | null)[]) => {
    const winners: Player[] = [];
    (['player1', 'player2'] as Player[]).forEach(p => {
      const won = WIN_PATTERNS.some(pat => pat.every(idx => board[idx]?.player === p));
      if (won) winners.push(p);
    });
    return winners;
  };

  const handleSelectPiece = useCallback((player: Player, value: number, isCpuMove: boolean = false) => {
    setGameState(prev => {
      if (prev.status !== 'playing' || prev.currentPlayer !== player || prev.mode !== 'place') return prev;
      if (!isCpuMove && prev.currentPlayer === 'player2' && prev.opponentType !== 'player') return prev;
      if (prev.onBoardPieces[player].includes(value)) return prev;
      return { ...prev, selectedPieceValue: value === prev.selectedPieceValue ? null : value };
    });
  }, []);

  const handleInteract = useCallback((slotIndex: number, isCpuMove: boolean = false) => {
    setGameState(prev => {
      if (prev.status !== 'playing') return prev;
      if (!isCpuMove && prev.currentPlayer === 'player2' && prev.opponentType !== 'player') return prev;

      let newBoard = [...prev.board];
      let newOnBoard = { ...prev.onBoardPieces };

      if (prev.mode === 'place') {
        if (prev.selectedPieceValue === null) return prev;
        
        const currentAtSlot = newBoard[slotIndex];
        const canPlace = !currentAtSlot || (currentAtSlot.player !== prev.currentPlayer && prev.selectedPieceValue > currentAtSlot.value);
        
        if (canPlace) {
          newBoard[slotIndex] = { 
            player: prev.currentPlayer, 
            value: prev.selectedPieceValue, 
            under: currentAtSlot 
          };
          newOnBoard[prev.currentPlayer] = [...newOnBoard[prev.currentPlayer], prev.selectedPieceValue];
          
          const winners = checkWin(newBoard);
          if (winners.length > 0) {
            return {
              ...prev,
              board: newBoard,
              onBoardPieces: newOnBoard,
              status: 'winner',
              winner: winners.length > 1 ? prev.currentPlayer : winners[0]
            };
          }

          // 配置完了 -> 手番交代
          const nextPlayer: Player = prev.currentPlayer === 'player1' ? 'player2' : 'player1';
          const nextPlayerCanPlace = checkCanPlaceAny(nextPlayer, newOnBoard[nextPlayer], newBoard);
          
          return {
            ...prev,
            board: newBoard,
            onBoardPieces: newOnBoard,
            currentPlayer: nextPlayer,
            cooldown: { ...prev.cooldown, [nextPlayer]: null },
            selectedPieceValue: null,
            hasRecoveredThisTurn: false,
            mode: nextPlayerCanPlace ? 'place' : 'return'
          };
        }
        return prev;
      } else {
        // 回収アクション
        const currentAtSlot = newBoard[slotIndex];
        if (currentAtSlot && currentAtSlot.player === prev.currentPlayer) {
          const val = currentAtSlot.value;
          newBoard[slotIndex] = currentAtSlot.under;
          newOnBoard[prev.currentPlayer] = newOnBoard[prev.currentPlayer].filter(v => v !== val);
          
          const winners = checkWin(newBoard);
          if (winners.length > 0) {
              return {
                ...prev,
                board: newBoard,
                onBoardPieces: newOnBoard,
                status: 'winner',
                winner: winners.length > 1 ? prev.currentPlayer : winners[0]
              };
          }

          // 回収後、配置が可能になったかをチェック
          const canPlaceNow = checkCanPlaceAny(prev.currentPlayer, newOnBoard[prev.currentPlayer], newBoard);
          
          if (canPlaceNow) {
            // 配置が可能なら配置モードへ（手番継続）
            return {
              ...prev,
              board: newBoard,
              onBoardPieces: newOnBoard,
              hasRecoveredThisTurn: true,
              mode: 'place',
              selectedPieceValue: null,
              cooldown: { ...prev.cooldown, [prev.currentPlayer]: val }
            };
          } else {
            // 回収してもなお配置不可なら手番終了
            const nextPlayer: Player = prev.currentPlayer === 'player1' ? 'player2' : 'player1';
            const nextPlayerCanPlace = checkCanPlaceAny(nextPlayer, newOnBoard[nextPlayer], newBoard);
            return {
              ...prev,
              board: newBoard,
              onBoardPieces: newOnBoard,
              currentPlayer: nextPlayer,
              cooldown: { ...prev.cooldown, [prev.currentPlayer]: val, [nextPlayer]: null },
              selectedPieceValue: null,
              hasRecoveredThisTurn: false,
              mode: nextPlayerCanPlace ? 'place' : 'return'
            };
          }
        }
        return prev;
      }
    });
  }, []);

  useEffect(() => {
    if (gameState.status === 'playing' && gameState.currentPlayer === 'player2' && gameState.opponentType !== 'player') {
      const timer = setTimeout(() => {
        const move = calculateCPUMove(gameState);
        if (move) {
          if (move.action === 'place' && move.pieceValue) {
            handleSelectPiece('player2', move.pieceValue, true);
            setTimeout(() => {
              handleInteract(move.slotIndex, true);
            }, 500);
          } else if (move.action === 'return') {
            handleInteract(move.slotIndex, true);
          }
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.status, gameState.currentPlayer, gameState.mode, gameState.opponentType, gameState.board, gameState.onBoardPieces, handleSelectPiece, handleInteract]);

  useEffect(() => {
    if (containerRef.current && !sceneRef.current) {
      sceneRef.current = new ThreeScene(
        containerRef.current, 
        (slotIndex) => handleInteract(slotIndex, false), 
        (player, value) => handleSelectPiece(player, value, false)
      );
    }
    return () => {
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, [handleInteract, handleSelectPiece]);

  useEffect(() => {
    sceneRef.current?.sync({
      board: gameState.board,
      currentPlayer: gameState.currentPlayer,
      onBoardPieces: gameState.onBoardPieces,
      cooldown: gameState.cooldown,
      selectedPieceValue: gameState.selectedPieceValue,
      mode: gameState.mode,
      isConfirm: gameState.status === 'confirm'
    });
  }, [gameState]);

  const startGame = (opponentType: OpponentType) => setGameState({ ...INITIAL_STATE, status: 'playing', opponentType });
  const resetGame = () => setGameState(prev => ({ ...INITIAL_STATE, status: 'playing', opponentType: prev.opponentType }));
  const backToTitle = () => setGameState({ ...INITIAL_STATE, status: 'start' });
  
  const isForcedRecovery = !isPlacementPossible;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-100">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* BGM Audio Element */}
      <audio ref={audioRef} src={`${import.meta.env.BASE_URL}bgm.mp3`} loop />

      {/* BGM Toggle Button */}
      <div className="absolute top-6 right-6 z-50 pointer-events-auto">
        <button
          onClick={() => setIsBgmPlaying(!isBgmPlaying)}
          className="bg-white/80 backdrop-blur-md p-3 rounded-full shadow-lg border border-white/50 text-slate-600 hover:bg-white hover:text-amber-600 transition-all active:scale-95 flex items-center justify-center"
          title={isBgmPlaying ? "BGMをミュート" : "BGMを再生"}
        >
          {isBgmPlaying ? <Volume2 size={24} /> : <VolumeX size={24} />}
        </button>
      </div>

      {gameState.status === 'confirm' && (
        <div className="absolute inset-0 z-40 pointer-events-none flex flex-col items-center justify-between p-12 bg-black/5">
          <div className="bg-amber-600/95 backdrop-blur-md px-10 py-4 rounded-full text-white font-black text-sm shadow-2xl border border-white/20 animate-bounce pointer-events-auto">
            盤面確認中（ドラッグで回転、ホイールでズーム）
          </div>
          <button 
            className="bg-white/95 backdrop-blur-2xl text-slate-800 font-black py-5 px-12 rounded-2xl shadow-2xl border border-white pointer-events-auto active:scale-95 transition-all mb-12 hover:bg-white"
            onClick={() => setGameState(prev => ({...prev, status: 'winner'}))}
          >
            結果画面に戻る
          </button>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none z-10 p-6 flex flex-col justify-between">
        {gameState.status === 'start' && (
          <div className="m-auto pointer-events-auto bg-white/90 backdrop-blur-2xl p-10 rounded-[48px] shadow-2xl flex flex-col items-center max-w-sm w-full border border-white">
            <h1 className="text-5xl font-black text-slate-800 mb-2 tracking-tighter text-center leading-tight">
              BRIGHT<br />CAFE <span className="text-amber-600">3D</span>
            </h1>
            <p className="text-slate-400 mb-8 font-bold uppercase tracking-widest text-xs">A Strategic Coffee Break</p>
            
            <div className="w-full flex flex-col gap-3 mb-6">
              <button 
                className="bg-amber-600 hover:bg-amber-500 text-white font-black py-4 px-6 rounded-2xl w-full text-lg transition-all shadow-xl active:scale-95 shadow-amber-200"
                onClick={() => startGame('player')}
              >
                2人対戦 (Local)
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button 
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-2 rounded-xl w-full text-sm transition-all shadow-lg active:scale-95"
                  onClick={() => startGame('cpu_easy')}
                >
                  CPU 初級
                </button>
                <button 
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-2 rounded-xl w-full text-sm transition-all shadow-lg active:scale-95"
                  onClick={() => startGame('cpu_normal')}
                >
                  CPU 中級
                </button>
                <button 
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-2 rounded-xl w-full text-sm transition-all shadow-lg active:scale-95"
                  onClick={() => startGame('cpu_hard')}
                >
                  CPU 上級
                </button>
              </div>
            </div>

            <button 
              className="text-slate-400 font-bold hover:text-slate-600 transition-colors py-2"
              onClick={() => setShowRules(true)}
            >
              遊び方
            </button>
          </div>
        )}

        {(gameState.status === 'playing') && (
          <>
            <div className="flex justify-center mt-4">
              <div className="bg-white/80 backdrop-blur-xl rounded-full px-12 py-3 shadow-lg border border-white/50 pointer-events-auto">
                <span className={`text-2xl font-black tracking-tight ${gameState.currentPlayer === 'player1' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {gameState.currentPlayer === 'player1' 
                    ? '緑の手番' 
                    : (gameState.opponentType !== 'player' ? 'CPU思考中...' : '赤の手番')}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-6 mb-8">
                {isForcedRecovery ? (
                    <div className="bg-rose-100 text-rose-600 px-6 py-2 rounded-full text-[11px] font-black tracking-widest uppercase shadow-sm border border-rose-200 animate-pulse">
                        要回収：配置可能な場所がありません
                    </div>
                ) : gameState.hasRecoveredThisTurn ? (
                    <div className="bg-amber-100 text-amber-700 px-6 py-2 rounded-full text-[11px] font-black tracking-widest uppercase shadow-sm border border-amber-200">
                        配置が必要です：駒を1つ選んで置いてください
                    </div>
                ) : (
                    <div className="bg-emerald-50 text-emerald-600 px-6 py-2 rounded-full text-[11px] font-black tracking-widest uppercase shadow-sm border border-emerald-100">
                        配置（必須）または回収（任意）
                    </div>
                )}
                
                <div className="bg-white/80 backdrop-blur-xl rounded-[24px] p-2 shadow-xl border border-white/50 flex gap-1 pointer-events-auto">
                    <button 
                        disabled={isForcedRecovery || (gameState.currentPlayer === 'player2' && gameState.opponentType !== 'player')}
                        className={`px-10 py-3 rounded-[18px] font-black transition-all ${gameState.mode === 'place' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'text-slate-400 hover:text-slate-600'} disabled:opacity-20 disabled:grayscale`}
                        onClick={() => setGameState(prev => ({...prev, mode: 'place', selectedPieceValue: null}))}
                    >
                        配置
                    </button>
                    <button 
                        disabled={gameState.hasRecoveredThisTurn || (gameState.currentPlayer === 'player2' && gameState.opponentType !== 'player')}
                        className={`px-10 py-3 rounded-[18px] font-black transition-all ${gameState.mode === 'return' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'text-slate-400 hover:text-slate-600'} disabled:opacity-20 disabled:grayscale`}
                        onClick={() => setGameState(prev => ({...prev, mode: 'return', selectedPieceValue: null}))}
                    >
                        回収
                    </button>
                </div>
                
                <div className="flex gap-10 pointer-events-auto">
                    <button onClick={resetGame} className="text-slate-400 hover:text-slate-600 font-black text-[10px] uppercase tracking-[0.2em] transition-colors">RESET</button>
                    <button onClick={backToTitle} className="text-slate-400 hover:text-slate-600 font-black text-[10px] uppercase tracking-[0.2em] transition-colors">QUIT GAME</button>
                </div>
            </div>
          </>
        )}
      </div>

      {(showRules || gameState.status === 'winner') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
            {showRules && (
                <div className="bg-white text-slate-800 p-12 rounded-[50px] shadow-2xl max-w-md w-full animate-in zoom-in duration-300 border border-white overflow-y-auto max-h-[90vh]">
                    <h2 className="text-3xl font-black mb-8 text-amber-600 text-center">Bright Cafe 3D の遊び方</h2>
                    <div className="space-y-6 mb-10 text-sm leading-relaxed text-slate-500 font-bold">
                        <p className="flex gap-4"><span className="text-amber-600 shrink-0">01.</span> <span><b>手番の流れ</b>：1回の手番で「1回の回収（任意）」と「1回の配置（必須）」が行えます。回収をスキップして直接配置することも可能です。</span></p>
                        <p className="flex gap-4"><span className="text-amber-600 shrink-0">02.</span> <span><b>カバー</b>：盤面にある駒より<b>大きな数字</b>の駒なら、上から被せて隠せます。</span></p>
                        <p className="flex gap-4"><span className="text-amber-600 shrink-0">03.</span> <span><b>戦略的リカバリー</b>：手番開始時に配置できる場所がなくても、自分の駒を回収することで配置が可能になる場合は、続けて配置を行う必要があります。</span></p>
                        <p className="flex gap-4"><span className="text-amber-600 shrink-0">04.</span> <span><b>強制終了</b>：手持ちの駒がなく（または配置不可で）、かつ回収を行ってもなお配置できる場所がない場合に限り、回収のみで手番が終了します。</span></p>
                        <p className="flex gap-4"><span className="text-amber-600 shrink-0">05.</span> <span><b>勝利</b>：自分の色の駒を縦・横・斜めのいずれか3列揃えれば勝利です。</span></p>
                    </div>
                    <button 
                        className="bg-amber-600 hover:bg-amber-500 text-white font-black py-5 px-10 rounded-2xl w-full transition-all shadow-xl active:scale-95 shadow-amber-100"
                        onClick={() => setShowRules(false)}
                    >
                        承知した
                    </button>
                </div>
            )}

            {gameState.status === 'winner' && (
                <div className="bg-white text-slate-800 p-12 rounded-[50px] shadow-2xl max-w-sm w-full text-center animate-in zoom-in duration-300 border border-white">
                    <h2 className={`text-4xl font-black mb-2 ${gameState.winner === 'player1' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {gameState.winner === 'player1' 
                            ? (gameState.opponentType !== 'player' ? 'YOU WIN!' : 'P1 VICTORY') 
                            : (gameState.opponentType !== 'player' ? 'CPU WINS' : 'P2 VICTORY')}
                    </h2>
                    <p className="text-base text-slate-400 mb-10 font-bold uppercase tracking-widest">
                        {gameState.winner === 'player1' 
                            ? (gameState.opponentType !== 'player' ? 'You win the match' : 'Player 1 wins the match') 
                            : (gameState.opponentType !== 'player' ? 'CPU wins the match' : 'Player 2 wins the match')}
                    </p>
                    <div className="flex flex-col gap-4">
                        <button 
                            className="bg-amber-600 hover:bg-amber-500 text-white font-black py-5 px-10 rounded-2xl w-full shadow-xl transition-all active:scale-95 shadow-amber-100"
                            onClick={resetGame}
                        >
                            もう一度対局
                        </button>
                        <button 
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-4 px-10 rounded-2xl w-full transition-all active:scale-95"
                            onClick={() => setGameState(prev => ({...prev, status: 'confirm'}))}
                        >
                            盤面を確認
                        </button>
                        <button 
                            className="text-slate-400 font-bold py-2 hover:text-slate-600 transition-colors text-xs uppercase tracking-widest"
                            onClick={backToTitle}
                        >
                            タイトルに戻る
                        </button>
                    </div>
                </div>
            )}
        </div>
      )}
    </div>
  );
}
