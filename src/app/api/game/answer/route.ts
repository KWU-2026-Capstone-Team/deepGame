import { NextResponse } from 'next/server';
import type { Label, Verdict } from '@/types/game';
import { getGame } from '@/lib/games';

export const dynamic = 'force-dynamic';

/**
 * POST /api/game/answer { gameId, round, clipId, answer: 'real' | 'fake' }
 * 라운드마다 한 번만 답할 수 있고, 답을 낸 뒤에야 그 영상의 정답과 해설을 돌려준다.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    gameId?: unknown; round?: unknown; clipId?: unknown; answer?: unknown;
  };
  const game = typeof body.gameId === 'string' ? getGame(body.gameId) : undefined;
  if (!game) {
    return NextResponse.json({ error: '게임을 찾을 수 없습니다. 새로 시작해 주세요.' }, { status: 404 });
  }

  const round = Number(body.round);
  const answer = body.answer as Label;
  if (!Number.isInteger(round) || round < 0 || round >= game.rounds.length || (answer !== 'real' && answer !== 'fake')) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (game.answered.has(round)) {
    return NextResponse.json({ error: '이미 답한 라운드입니다.' }, { status: 409 });
  }
  // 출제 영상이 깨져 예비 영상으로 바꿨을 수 있으므로 그 라운드의 후보 중에서 찾는다
  const clip = game.rounds[round].find((c) => c.id === body.clipId);
  if (!clip) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  game.answered.add(round);
  const verdict: Verdict = {
    label: clip.label,
    correct: clip.label === answer,
    explanation: clip.explanation,
    cues: clip.cues,
    tips: clip.tips ?? [],
    technique: clip.technique ?? undefined,
  };
  return NextResponse.json(verdict);
}
