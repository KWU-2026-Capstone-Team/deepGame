export type Difficulty = 'easy' | 'medium' | 'hard';
export type Label = 'real' | 'fake';
export type GamePhase = 'loading' | 'watching' | 'revealing';

/** 서버에만 있는 영상 정보 (정답·해설 포함). 브라우저에는 보내지 않는다. */
export interface VideoClip {
  id: string;
  src: string;
  poster?: string;
  label: Label;
  explanation: string;
  /** 이 영상에서 실제로 확인된 단서 */
  cues: string[];
  /** 영상과 상관없는 일반적인 확인 요령 */
  tips?: string[];
  /** 없으면 모든 난이도에서 출제된다 */
  difficulty?: Difficulty;
  technique?: string;
}

/** 브라우저가 받는 출제 영상 (정답 없음) */
export interface RoundClip {
  id: string;
  src: string;
  /** 영상이 깨졌을 때 바꿔 끼울 예비 영상 (같은 라벨) */
  alternates: { id: string; src: string }[];
}

/** POST /api/game 응답 */
export interface StartGameResponse {
  gameId: string;
  rounds: RoundClip[];
}

/** 답을 낸 뒤 서버가 알려 주는 정답과 해설 (POST /api/game/answer 응답) */
export interface Verdict {
  label: Label;
  correct: boolean;
  explanation: string;
  /** 이 영상에서 실제로 확인된 단서 */
  cues: string[];
  /** 일반적인 확인 요령 */
  tips: string[];
  technique?: string;
}

export interface RoundResult {
  videoId: string;
  label: Label;
  userAnswer: Label | null;
  correct: boolean;
  timeUsed: number;
  points: number;
}

export interface GameSession {
  results: RoundResult[];
  score: number;
  maxStreak: number;
  totalRounds: number;
}
