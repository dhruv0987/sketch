export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST'
}

export interface GuessResult {
  commentary: string;
  guesses: string[];
}

export interface DrawingCanvasRef {
  clear: () => void;
  getDataUrl: () => string;
  isEmpty: () => boolean;
}

export interface Point {
  x: number;
  y: number;
}
