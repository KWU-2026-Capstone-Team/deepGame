import { randomUUID } from 'crypto';
import type { VideoClip } from '@/types/game';

/**
 * 진행 중인 게임 (서버 메모리). 정답은 여기에만 있고, 브라우저는 답을 낸 라운드의 정답만 받는다.
 * 서버를 다시 켜면 사라지므로 진행 중이던 게임은 새로 시작해야 한다.
 */
export interface Game {
  /** 라운드별 후보 영상. [0]이 출제 영상, 나머지는 깨졌을 때 쓸 같은 라벨의 예비 영상 */
  rounds: VideoClip[][];
  /** 답을 낸 라운드 번호 (같은 라운드에 두 번 답할 수 없음) */
  answered: Set<number>;
  createdAt: number;
}

const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6시간 지난 게임은 지운다
const MAX_GAMES = 1000;

// 개발 서버가 코드를 다시 불러와도 유지되도록 globalThis에 둔다
const store: Map<string, Game> =
  ((globalThis as { __deepgameGames?: Map<string, Game> }).__deepgameGames ??= new Map());

function prune() {
  const now = Date.now();
  for (const [id, game] of store) {
    if (now - game.createdAt > MAX_AGE_MS) store.delete(id);
  }
  // 그래도 너무 많으면 오래된 것부터 지운다 (메모리 보호)
  while (store.size >= MAX_GAMES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function createGame(rounds: VideoClip[][]): string {
  prune();
  const id = randomUUID();
  store.set(id, { rounds, answered: new Set(), createdAt: Date.now() });
  return id;
}

export function getGame(id: string): Game | undefined {
  return store.get(id);
}
