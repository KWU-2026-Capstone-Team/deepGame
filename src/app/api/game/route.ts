import { NextResponse } from 'next/server';
import type { Difficulty, RoundClip, StartGameResponse } from '@/types/game';
import { loadAllClips, pickRounds } from '@/lib/clips';
import { createGame } from '@/lib/games';

export const dynamic = 'force-dynamic';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const MAX_ROUNDS = 30;

/**
 * POST /api/game { difficulty: 'easy' | 'medium' | 'hard' | 'all', rounds: number }
 * 새 게임을 만들고 라운드별 영상 주소만 돌려준다. 정답은 서버에만 남는다.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { difficulty?: unknown; rounds?: unknown };
  const difficulty = DIFFICULTIES.includes(body.difficulty as Difficulty) ? (body.difficulty as Difficulty) : undefined;
  const rounds = Math.min(Math.max(Math.trunc(Number(body.rounds)) || 10, 1), MAX_ROUNDS);

  const picked = pickRounds(loadAllClips(difficulty), rounds);
  const gameId = createGame(picked);
  const response: StartGameResponse = {
    gameId,
    rounds: picked.map<RoundClip>(([clip, ...alternates]) => ({
      id: clip.id,
      src: clip.src,
      alternates: alternates.map((a) => ({ id: a.id, src: a.src })),
    })),
  };
  return NextResponse.json(response);
}
