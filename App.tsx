import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Eraser, PenTool, CheckCircle, XCircle, ThumbsUp, Volume2, VolumeX, User, Dices } from 'lucide-react';
import confetti from 'canvas-confetti';

import DrawingCanvas from './components/DrawingCanvas';
import { identifySketch } from './services/gemini';
import { 
  GameState, 
  DrawingCanvasRef 
} from './types';
import { 
  WORD_LIST, 
  GAME_DURATION_SECONDS, 
  AI_POLL_INTERVAL_MS,
  FAILURE_MESSAGES
} from './constants';

function App() {
  // Game State
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [playerName, setPlayerName] = useState<string>('');
  const [targetWord, setTargetWord] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SECONDS);
  
  // Scoring
  const [aiScore, setAiScore] = useState(0);
  const [humanScore, setHumanScore] = useState(0);
  
  // AI Interaction State
  const [aiCommentary, setAiCommentary] = useState<string>("Ready when you are!");
  const [lastGuesses, setLastGuesses] = useState<string[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  
  // Audio State
  const [isMuted, setIsMuted] = useState(false);
  
  // Refs
  const canvasRef = useRef<DrawingCanvasRef>(null);
  const timerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const isRequestingRef = useRef(false);

  // --- Audio Logic ---

  const speak = useCallback((text: string) => {
    if (isMuted || !window.speechSynthesis) return;

    // Cancel any currently speaking utterance to avoid queue buildup
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; // Slightly faster for excitement
    utterance.pitch = 1.0;
    
    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices();
    // Prefer a "Google" voice if available, or just the default
    const preferredVoice = voices.find(v => v.name.includes('Google US English')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    window.speechSynthesis.speak(utterance);
  }, [isMuted]);

  // Ensure voices are loaded (browsers load them asynchronously)
  useEffect(() => {
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
             // Forces voice list refresh
        };
    }
  }, []);

  // --- Game Logic ---

  const startGame = useCallback(() => {
    if (!playerName.trim()) return;
    
    // Pick a random word automatically
    const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    setTargetWord(word);
    
    setGameState(GameState.PLAYING);
    setTimeLeft(GAME_DURATION_SECONDS);
    setAiCommentary("I'm guessing...");
    speak(`Okay ${playerName}, draw a ${word}!`);
    setLastGuesses([]);
    setIsAiThinking(false);
    
    // Clear canvas
    if (canvasRef.current) {
      canvasRef.current.clear();
    }
  }, [playerName, speak]);

  const endGame = useCallback((aiWon: boolean, winningGuess?: string) => {
    setGameState(aiWon ? GameState.WON : GameState.LOST);
    
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);

    if (aiWon) {
      // AI guessed correctly
      const finalAnswer = winningGuess || targetWord;
      const msg = `I know! It's a ${finalAnswer}! Better luck next time, ${playerName}!`;
      setAiCommentary(msg);
      speak(msg);
      setAiScore(s => s + 1);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#ffffff', '#eab308']
      });
    } else {
      // Human stumped the AI
      const msg = FAILURE_MESSAGES[Math.floor(Math.random() * FAILURE_MESSAGES.length)];
      const fullMsg = `${msg} I couldn't guess it was a ${targetWord}.`;
      setAiCommentary(fullMsg);
      speak(fullMsg);
      setHumanScore(s => s + 1);
    }
  }, [targetWord, playerName, speak]);

  // --- AI Polling ---

  const checkDrawing = useCallback(async () => {
    if (gameState !== GameState.PLAYING || !canvasRef.current || isRequestingRef.current) return;
    
    // Don't check if canvas is empty
    if (canvasRef.current.isEmpty()) return;

    isRequestingRef.current = true;
    setIsAiThinking(true);

    try {
      const imageData = canvasRef.current.getDataUrl();
      const result = await identifySketch(imageData);

      // Only speak if the commentary is new and we aren't about to end the game immediately
      if (result.commentary && result.commentary !== aiCommentary) {
        setAiCommentary(result.commentary);
        speak(result.commentary);
      }
      
      setLastGuesses(result.guesses);

      // Check for win
      const target = targetWord.toLowerCase().trim();
      
      // Find the exact guess that matches
      const winningMatch = result.guesses.find(guess => {
         const g = guess.toLowerCase();
         // Direct match, partial match, or strict inclusion
         return g === target || g.includes(target) || target.includes(g);
      });

      if (winningMatch) {
        endGame(true, winningMatch);
      }
    } catch (error) {
      console.error("AI check failed", error);
    } finally {
      isRequestingRef.current = false;
      setIsAiThinking(false);
    }
  }, [gameState, targetWord, endGame, aiCommentary, speak]);

  // --- Effects ---

  // Timer Effect
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            endGame(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, endGame]);

  // AI Polling Effect
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      // Immediate first check after delay? No, let user draw first.
      pollRef.current = window.setInterval(checkDrawing, AI_POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [gameState, checkDrawing]);


  // --- Render Helpers ---

  const renderOverlay = () => {
    if (gameState === GameState.PLAYING) return null;

    return (
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        {gameState === GameState.MENU && (
          <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl border-2 border-indigo-500 shadow-2xl">
            <h1 className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-2">
              SKETCH BATTLE
            </h1>
            <p className="text-slate-300 mb-6 text-lg">
              Can you stump the AI?
            </p>
            
            <div className="flex flex-col gap-4 mb-6 w-full">
              
              {/* Player Name Input */}
              <div>
                <label className="text-left text-sm font-bold text-slate-400 ml-1 block mb-1">YOUR NAME</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input 
                    type="text" 
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-slate-900 border-2 border-slate-600 rounded-xl pl-10 pr-4 py-3 text-white focus:border-indigo-500 focus:outline-none transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && startGame()}
                  />
                </div>
              </div>

              <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
                <div className="flex items-center gap-3">
                   <Dices className="w-8 h-8 text-indigo-400" />
                   <p className="text-sm text-slate-300 text-left">
                     The game will randomly pick an object for you to draw. Don't worry, the AI won't peek!
                   </p>
                </div>
              </div>
            </div>

            <button
              onClick={startGame}
              disabled={!playerName.trim()}
              className="group w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
            >
              <Play className="w-6 h-6 fill-current" />
              START GAME
            </button>
          </div>
        )}

        {gameState === GameState.WON && (
          <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl border-2 border-green-500 shadow-2xl">
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h2 className="text-4xl font-bold text-white mb-2">AI WINS!</h2>
            <p className="text-xl text-green-300 mb-6">It guessed your <b>{targetWord}</b>!</p>
            <p className="text-slate-400 italic mb-6">"Better luck next time, {playerName}!"</p>
            <button
              onClick={() => setGameState(GameState.MENU)}
              className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
            >
              <RotateCcw className="w-6 h-6" />
              PLAY AGAIN
            </button>
          </div>
        )}

        {gameState === GameState.LOST && (
          <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl border-2 border-red-500 shadow-2xl">
            <XCircle className="w-20 h-20 text-red-500 mx-auto mb-4" />
            <h2 className="text-4xl font-bold text-white mb-2">YOU WIN!</h2>
            <p className="text-xl text-slate-300 mb-6">
              You stumped the AI! It couldn't guess <span className="text-indigo-400 font-bold">{targetWord}</span>.
            </p>
            <button
              onClick={() => setGameState(GameState.MENU)}
              className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
            >
              <RotateCcw className="w-6 h-6" />
              TRY AGAIN
            </button>
          </div>
        )}
      </div>
    );
  };

  const getProgressColor = () => {
    if (timeLeft > 15) return 'bg-green-500';
    if (timeLeft > 7) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 relative">
      {/* Header / Top Bar */}
      <header className="flex-none p-4 pb-2 bg-slate-800 border-b border-slate-700 flex justify-between items-center shadow-md z-10">
        <div className="flex items-center gap-3 min-w-[120px]">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <PenTool className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-slate-200 leading-tight">Sketch Battle</h1>
            <div className="flex gap-3 text-xs">
              <span className="text-green-400 font-bold">AI: {aiScore}</span>
              <span className="text-blue-400 font-bold">{playerName ? playerName.toUpperCase().slice(0, 10) : 'YOU'}: {humanScore}</span>
            </div>
          </div>
        </div>

        {gameState === GameState.PLAYING ? (
          <div className="flex flex-col items-center">
             <div className="text-sm text-slate-400 mb-1 font-medium">YOU ARE DRAWING</div>
             <div className="text-xl sm:text-2xl font-black text-white tracking-wider uppercase truncate max-w-[200px]">
               {targetWord}
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center opacity-50">
             <div className="text-2xl font-black text-slate-500">???</div>
          </div>
        )}

        <div className="flex items-center gap-3 min-w-[120px] justify-end">
           <button 
             onClick={() => setIsMuted(!isMuted)} 
             className="p-2 text-slate-400 hover:text-white transition-colors"
           >
             {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
           </button>
           <span className={`text-2xl font-mono font-bold ${timeLeft <= 5 ? 'text-red-500' : 'text-slate-200'}`}>
             {timeLeft}s
           </span>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-slate-800">
        <div 
          className={`h-full transition-all duration-1000 ease-linear ${getProgressColor()}`} 
          style={{ width: `${(timeLeft / GAME_DURATION_SECONDS) * 100}%` }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col p-4 gap-4 overflow-hidden">
        
        {/* Canvas Area */}
        <div className="flex-1 bg-slate-100 rounded-2xl shadow-xl overflow-hidden relative border-4 border-slate-700">
           <DrawingCanvas ref={canvasRef} strokeWidth={5} strokeColor="#000" disabled={gameState !== GameState.PLAYING} />
           
           {/* Canvas Controls */}
           {gameState === GameState.PLAYING && (
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                 <button 
                  onClick={() => canvasRef.current?.clear()}
                  className="p-3 bg-white/90 rounded-full shadow-lg hover:bg-red-50 text-red-500 transition-colors"
                  title="Clear Canvas"
                >
                  <Eraser className="w-6 h-6" />
                </button>
              </div>
           )}
        </div>

        {/* AI Feedback Area */}
        <div className="flex-none h-48 sm:h-40 bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-lg flex flex-col gap-3 relative overflow-hidden">
          {/* AI Status Indicator */}
          <div className="absolute top-2 right-2 flex gap-1">
             <div className={`w-3 h-3 rounded-full ${isAiThinking ? 'bg-indigo-500 animate-ping' : 'bg-slate-600'}`}></div>
          </div>
          
          {/* Manual Win Button (In case AI is close but strict match fails) */}
          {gameState === GameState.PLAYING && (
            <button
              onClick={() => endGame(true, targetWord)}
              className="absolute bottom-4 right-4 p-2 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg border border-green-600/50 transition-colors text-xs font-bold flex items-center gap-1 z-20"
              title="Click if AI guessed right but app didn't register"
            >
              <ThumbsUp className="w-4 h-4" /> That's it!
            </button>
          )}

          {/* AI Commentary Bubble */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex-none flex items-center justify-center shadow-lg border-2 border-slate-600">
               <span className="text-2xl">🤖</span>
            </div>
            <div className="flex-1 bg-slate-700 rounded-2xl rounded-tl-none p-3 shadow-sm border border-slate-600 pr-12">
               <p className="text-white font-medium text-lg leading-snug">
                 {aiCommentary}
               </p>
            </div>
          </div>

          {/* Guesses Stream */}
          <div className="mt-auto">
             <div className="text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">Recent Guesses</div>
             <div className="flex flex-wrap gap-2">
               {lastGuesses.length > 0 ? (
                 lastGuesses.map((guess, idx) => (
                   <span key={idx} className="px-3 py-1 bg-slate-900 text-indigo-300 rounded-full text-sm font-semibold border border-slate-700 animate-fade-in-up">
                     {guess}
                   </span>
                 ))
               ) : (
                 <span className="text-slate-600 italic text-sm">Waiting for ink...</span>
               )}
             </div>
          </div>
        </div>

      </main>

      {/* Overlays */}
      {renderOverlay()}
    </div>
  );
}

export default App;