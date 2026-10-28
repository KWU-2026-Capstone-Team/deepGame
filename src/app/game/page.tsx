'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Label, RoundClip, RoundResult, GameSession, StartGameResponse, Verdict } from '@/types/game';

// ── 유틸 ───────────────────────────────────────────────────────────────────────

/** 이 시간 안에 첫 프레임이 안 나오면 재생할 수 없는 영상으로 보고 건너뛴다. */
const LOAD_TIMEOUT_MS = 10_000;

/** 정답 시 획득 점수. streak은 이번 답변 직전의 연속 정답 수. */
function calcPoints(streak: number): number {
  return 100 + 10 * streak;
}

/** 브라우저에서 보이는 라운드 정보. index는 서버가 아는 원래 라운드 번호 (라운드가 빠져도 유지). */
interface PlayRound extends RoundClip {
  index: number;
}


// ── 게임 본체 ─────────────────────────────────────────────────────────────────

function GameInner() {
  const router = useRouter();
  const params = useSearchParams();
  const totalRounds = parseInt(params.get('rounds') ?? '10', 10);
  const difficultyParam = params.get('difficulty') ?? 'all';

  // ── State ──────────────────────────────────────────────────────────────────
  const [clips, setClips] = useState<PlayRound[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'watching' | 'revealing'>('loading');
  const [videoEnded, setVideoEnded] = useState(false);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [allResults, setAllResults] = useState<RoundResult[]>([]);
  const [hasReplayed, setHasReplayed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 서버에 답을 보내고 기다리는 중인 답 */
  const [submitting, setSubmitting] = useState<Label | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef          = useRef<HTMLVideoElement>(null);
  const pendingSessionRef = useRef<GameSession | null>(null);
  // 판별 시간: 영상이 처음 재생된 순간부터 재고, REPLAY로 다시 보는 동안은 멈춘다
  const elapsedRef        = useRef(0);                 // 지금까지 쌓인 시간 (ms)
  const clockStartRef     = useRef<number | null>(null); // 시계가 도는 중이면 시작 시각
  const replayingRef      = useRef(false);
  const answeredRef       = useRef(false);
  const gameIdRef         = useRef<string>('');
  const noticeTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mutable snapshot refs — submitAnswer 내 stale state 방지
  const scoreRef        = useRef(0);
  const streakRef       = useRef(0);
  const maxStreakRef    = useRef(0);
  const allResultsRef   = useRef<RoundResult[]>([]);
  const clipsRef        = useRef<PlayRound[]>([]);
  const currentRoundRef = useRef(0);

  useEffect(() => { scoreRef.current       = score;      }, [score]);
  useEffect(() => { streakRef.current      = streak;     }, [streak]);
  useEffect(() => { maxStreakRef.current   = maxStreak;  }, [maxStreak]);
  useEffect(() => { allResultsRef.current  = allResults; }, [allResults]);
  useEffect(() => { clipsRef.current       = clips;      }, [clips]);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  // ── 게임 시작 (마운트 1회) — 서버가 라운드를 뽑고, 정답은 서버에만 남는다 ─────
  useEffect(() => {
    fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: difficultyParam, rounds: totalRounds }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: StartGameResponse) => {
        if (data.rounds.length === 0) {
          setLoadError('이 난이도에 출제할 영상이 없습니다.');
          return;
        }
        gameIdRef.current = data.gameId;
        const rounds = data.rounds.map((r, index) => ({ ...r, index }));
        setClips(rounds);
        clipsRef.current = rounds;
        setPhase('watching');
        if (rounds.length < totalRounds) {
          showNotice(`출제할 수 있는 영상이 ${rounds.length}개뿐이라 ${rounds.length}라운드로 진행합니다.`);
        }
      })
      .catch(() => setLoadError('영상 목록을 불러오지 못했습니다.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 판별 시간 시계 ─────────────────────────────────────────────────────────
  const resetClock = useCallback(() => {
    elapsedRef.current = 0;
    clockStartRef.current = null;
    replayingRef.current = false;
  }, []);

  const pauseClock = useCallback(() => {
    if (clockStartRef.current !== null) {
      elapsedRef.current += Date.now() - clockStartRef.current;
      clockStartRef.current = null;
    }
  }, []);

  const startClock = useCallback(() => {
    if (clockStartRef.current === null && !answeredRef.current) clockStartRef.current = Date.now();
  }, []);

  /** 첫 재생 시작 (로딩으로 기다린 시간은 빼고 잰다) */
  const handlePlaying = useCallback(() => {
    if (!replayingRef.current) startClock();
  }, [startClock]);

  const handleEnded = useCallback(() => {
    setVideoEnded(true);
    if (replayingRef.current) {
      replayingRef.current = false;
      startClock(); // 다시 보기가 끝나면 시계를 다시 돌린다
    }
  }, [startClock]);

  // ── 영상 재생 (watching 진입 시) ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'watching' || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
  }, [currentRound, phase]);


  // ── 재생할 수 없는 영상 건너뛰기 ─────────────────────────────────────────────
  // 서버가 붙여 준 같은 라벨의 예비 영상으로 바꾸고, 예비가 없으면 그 라운드를 뺀다.
  const handleVideoError = useCallback(
    (src: string) => {
      if (answeredRef.current) return;
      const list = clipsRef.current;
      const i = currentRoundRef.current;
      const broken = list[i];
      if (!broken || broken.src !== src) return; // 이미 처리한 영상

      if (broken.alternates.length > 0) {
        const [replacement, ...rest] = broken.alternates;
        const next = list.map((c, k) => (k === i ? { ...c, ...replacement, alternates: rest } : c));
        clipsRef.current = next;
        setClips(next);
        showNotice('재생할 수 없는 영상이 있어 다른 영상으로 바꿨습니다.');
      } else {
        const next = list.filter((_, k) => k !== i);
        clipsRef.current = next;
        setClips(next);
        if (i >= next.length) {
          // 마지막 라운드였으면 지금까지의 결과로 끝낸다
          if (allResultsRef.current.length === 0) {
            setLoadError('재생할 수 있는 영상이 없습니다.');
            return;
          }
          const session: GameSession = {
            results:     allResultsRef.current,
            score:       scoreRef.current,
            maxStreak:   maxStreakRef.current,
            totalRounds: next.length,
          };
          sessionStorage.setItem('gameSession', JSON.stringify(session));
          router.push('/result');
          return;
        }
        showNotice('재생할 수 없는 영상이 있어 라운드를 하나 줄였습니다.');
      }
      resetClock();
      setHasReplayed(false);
      setVideoEnded(false);
    },
    [router, showNotice, resetClock],
  );

  // 오류 이벤트 없이 로딩만 멈춘 영상도 건너뛴다
  const currentSrc = clips[currentRound]?.src;
  useEffect(() => {
    if (phase !== 'watching' || !currentSrc) return;
    const timer = setTimeout(() => {
      if (!videoRef.current || videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        handleVideoError(currentSrc);
      }
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [currentSrc, phase, handleVideoError]);

  // ── 답변 처리 — 서버에 답을 보내고 정답·해설을 받는다 ───────────────────────
  const submitAnswer = useCallback(
    async (answer: Label) => {
      if (answeredRef.current) return;
      const clip = clipsRef.current[currentRoundRef.current];
      if (!clip) return;
      answeredRef.current = true;
      pauseClock();
      const timeUsed = Math.round(elapsedRef.current / 100) / 10; // 초, 소수 1자리
      setSubmitting(answer);

      let result: Verdict;
      try {
        const res = await fetch('/api/game/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameIdRef.current, round: clip.index, clipId: clip.id, answer }),
        });
        if (res.status === 404) {
          setSubmitting(null);
          setLoadError('게임 정보가 사라졌습니다 (서버 재시작 등). 새로 시작해 주세요.');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        result = await res.json();
      } catch {
        answeredRef.current = false; // 다시 답할 수 있게
        setSubmitting(null);
        startClock();
        showNotice('정답을 확인하지 못했습니다. 다시 눌러 주세요.');
        return;
      }

      const { correct } = result;
      const newStreak  = correct ? streakRef.current + 1 : 0;
      const points     = correct ? calcPoints(streakRef.current) : 0;
      const newScore   = scoreRef.current + points;
      const newMax     = Math.max(maxStreakRef.current, newStreak);

      const roundResult: RoundResult = {
        videoId:    clip.id,
        label:      result.label,
        userAnswer: answer,
        correct,
        timeUsed,
        points,
      };
      const newAllResults = [...allResultsRef.current, roundResult];

      setScore(newScore);
      setStreak(newStreak);
      setMaxStreak(newMax);
      setLastResult(roundResult);
      setVerdict(result);
      setAllResults(newAllResults);
      setSubmitting(null);
      setPhase('revealing');

      // 마지막 라운드면 세션 미리 저장 (advanceRound에서 사용)
      const isLast = currentRoundRef.current + 1 >= clipsRef.current.length;
      if (isLast) {
        pendingSessionRef.current = {
          results:     newAllResults,
          score:       newScore,
          maxStreak:   newMax,
          totalRounds: clipsRef.current.length,
        };
      }
    },
    [showNotice, pauseClock, startClock],
  );

  // ── 라운드 진행 (클릭 또는 스페이스바) ───────────────────────────────────
  const advanceRound = useCallback(() => {
    if (pendingSessionRef.current) {
      sessionStorage.setItem('gameSession', JSON.stringify(pendingSessionRef.current));
      router.push('/result');
    } else {
      answeredRef.current = false;
      resetClock();
      setHasReplayed(false);
      setVideoEnded(false);
      setCurrentRound((r) => r + 1);
      setPhase('watching');
    }
  }, [router, resetClock]);

  // ── 키보드 단축키 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' && phase === 'revealing') { e.preventDefault(); advanceRound(); return; }
      if (phase === 'revealing') return;
      if (e.key === 'r' || e.key === 'R') submitAnswer('real');
      if (e.key === 'f' || e.key === 'F') submitAnswer('fake');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, submitAnswer, advanceRound]);

  // ── 재재생 (1회 한정) ─────────────────────────────────────────────────────
  const handleReplay = useCallback(() => {
    pauseClock();
    replayingRef.current = true;
    setHasReplayed(true);
    setVideoEnded(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [pauseClock]);

  // ── 로딩 ────────────────────────────────────────────────────────────────────
  const MONO: React.CSSProperties = { fontFamily: 'var(--font-jetbrains-mono, monospace)' };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="text-xs tracking-[0.25em] uppercase" style={{ ...MONO, color: 'var(--red)' }}>
            LOAD FAILED
          </span>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>{loadError}</p>
          <button
            onClick={() => router.push('/')}
            className="py-2.5 px-6 transition-colors duration-150 active:scale-[0.98]"
            style={{
              ...MONO,
              fontSize: '0.65rem',
              letterSpacing: '0.2em',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '4px',
            }}
          >
            ← HOME
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'loading' || clips.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--cyan)' }}
          />
          <span className="text-xs tracking-[0.25em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
            LOADING EVIDENCE
          </span>
        </div>
      </div>
    );
  }

  const clip = clips[currentRound];
  const nextClip = clips[currentRound + 1];
  const locked = phase === 'revealing' || submitting !== null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>

      {/* ── HUD Header ── */}
      <header
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-sm tabular-nums" style={{ ...MONO, color: 'var(--muted)' }}>
          R.
          <span style={{ color: 'var(--foreground)', fontWeight: 700 }}>
            {String(currentRound + 1).padStart(2, '0')}
          </span>
          /{String(clips.length).padStart(2, '0')}
        </span>

        <span className="text-base font-bold tabular-nums" style={{ ...MONO, color: 'var(--foreground)' }}>
          {score.toLocaleString()}
        </span>

        <span className="text-sm tabular-nums" style={{ ...MONO, color: streak > 0 ? 'var(--cyan)' : 'var(--muted)' }}>
          ×{streak}
          <span className="ml-1 text-[0.6rem] tracking-wider" style={{ color: 'var(--muted)' }}>
            STREAK
          </span>
        </span>
      </header>

      {/* ── Video area ── */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden" style={{ background: '#000' }}>

        {/* Forensic monitor frame — 고정 16:9, 라운드마다 크기 동일 (화면 폭에 맞추되 58vh 높이로 상한) */}
        <div
          className="relative flex items-center justify-center overflow-hidden scanline"
          style={{
            width: 'min(100%, calc(58vh * 16 / 9))',
            aspectRatio: '16 / 9',
            background: '#000',
            borderLeft: '2px solid rgba(0,229,255,0.12)',
            borderRight: '2px solid rgba(0,229,255,0.12)',
          }}
        >

          {/* Notice (영상 수 부족 / 깨진 영상 건너뜀) */}
          {notice && (
            <div
              className="absolute top-10 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 animate-slide-up text-center"
              style={{
                ...MONO,
                fontSize: '0.65rem',
                letterSpacing: '0.05em',
                color: 'var(--foreground)',
                background: 'rgba(6,8,13,0.9)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                maxWidth: 'calc(100% - 32px)',
              }}
            >
              {notice}
            </div>
          )}

          {/* Status badge */}
          {phase === 'watching' && !videoEnded && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--red)' }} />
              <span className="text-[0.6rem] tracking-[0.25em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
                ANALYZING
              </span>
            </div>
          )}

          {/* Scan sweep beam */}
          {phase === 'watching' && !videoEnded && <div className="scan-beam" />}

          {/* Replay button */}
          {phase === 'watching' && videoEnded && !hasReplayed && (
            <button
              onClick={handleReplay}
              className="absolute bottom-4 right-4 z-10 animate-slide-up transition-colors duration-150"
              style={{
                ...MONO,
                fontSize: '0.65rem',
                letterSpacing: '0.15em',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
                background: 'rgba(6,8,13,0.85)',
                padding: '5px 10px',
                borderRadius: '4px',
                backdropFilter: 'blur(4px)',
              }}
            >
              ↺ REPLAY
            </button>
          )}

          <video
            key={clip.src}
            ref={videoRef}
            src={clip.src}
            autoPlay
            muted
            playsInline
            onPlaying={handlePlaying}
            onEnded={handleEnded}
            onError={() => handleVideoError(clip.src)}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ zIndex: 1 }}
          />
        </div>

        {/* 다음 라운드 영상을 미리 받아 둔다 (라운드가 바뀔 때 검은 화면 줄이기) */}
        {nextClip && (
          <video
            key={`preload-${nextClip.src}`}
            src={nextClip.src}
            preload="auto"
            muted
            playsInline
            aria-hidden
            className="absolute w-px h-px opacity-0 pointer-events-none"
          />
        )}

        {/* ── Reveal panel (slides up from bottom) ── */}
        {phase === 'revealing' && lastResult && verdict && (
          <div
            className={`absolute inset-x-0 bottom-0 animate-reveal-in z-20 ${
              lastResult.correct ? 'animate-glow-green' : 'animate-glow-red'
            }`}
            style={{
              background: lastResult.correct
                ? 'rgba(0, 8, 16, 0.96)'
                : 'rgba(18, 0, 8, 0.96)',
              borderTop: `1px solid ${lastResult.correct ? 'var(--cyan)' : 'var(--red)'}`,
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="px-5 py-4 space-y-3 max-w-lg mx-auto">

              {/* Headline + points */}
              <div className="flex items-center gap-3">
                <span
                  className="text-xl font-black tracking-wide"
                  style={{ color: lastResult.correct ? 'var(--cyan)' : 'var(--red)' }}
                >
                  {lastResult.correct ? 'CONFIRMED' : 'INCORRECT'}
                </span>
                {lastResult.points > 0 && (
                  <span className="text-sm font-bold" style={{ ...MONO, color: 'var(--cyan)' }}>
                    +{lastResult.points}
                  </span>
                )}
              </div>

              {/* Verdict line */}
              <div className="flex items-center gap-2 text-sm">
                <span style={{ ...MONO, color: 'var(--muted)', fontSize: '0.7rem' }}>VERDICT</span>
                <span className="font-bold" style={{ color: 'var(--foreground)' }}>
                  {verdict.label === 'real' ? 'REAL (진짜)' : 'FAKE (딥페이크)'}
                </span>
                {verdict.technique && (
                  <span style={{ ...MONO, color: 'var(--muted)', fontSize: '0.7rem' }}>
                    · {verdict.technique}
                  </span>
                )}
              </div>

              {/* Explanation */}
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                {verdict.explanation}
              </p>

              {/* Cue tags — 이 영상에서 실제로 확인된 단서 */}
              {verdict.cues.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span style={{ ...MONO, color: 'var(--muted)', fontSize: '0.6rem', letterSpacing: '0.1em' }}>
                    이 영상의 단서
                  </span>
                  {verdict.cues.map((cue) => (
                    <span
                      key={cue}
                      className="text-xs px-2 py-0.5"
                      style={{
                        border: '1px solid var(--border)',
                        color: 'var(--muted)',
                        borderRadius: '4px',
                        ...MONO,
                        fontSize: '0.65rem',
                      }}
                    >
                      {cue}
                    </span>
                  ))}
                </div>
              )}

              {/* 일반적인 확인 요령 (이 영상에 대한 판정이 아님) */}
              {verdict.tips.length > 0 && (
                <p className="text-[0.65rem] leading-relaxed" style={{ color: 'var(--muted)', opacity: 0.7 }}>
                  <span style={MONO}>확인 요령 · </span>
                  {verdict.tips.join(' · ')}
                </p>
              )}

              {/* Advance button */}
              <button
                onClick={advanceRound}
                className="w-full py-2.5 mt-1 transition-colors duration-150 active:scale-[0.98]"
                style={{
                  ...MONO,
                  fontSize: '0.65rem',
                  letterSpacing: '0.2em',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '4px',
                }}
              >
                NEXT ROUND →&nbsp;&nbsp;<span style={{ opacity: 0.4 }}>[SPACE]</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Verdict zone ── */}
      <div className="shrink-0 relative" style={{ borderTop: '1px solid var(--border)' }}>

        {/* Centered "VERDICT" chip riding the border */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3"
          style={{ background: 'var(--background)' }}
        >
          <span
            className={phase !== 'revealing' ? 'animate-verdict-pulse' : undefined}
            style={{ ...MONO, fontSize: '0.45rem', letterSpacing: '0.35em', color: 'var(--muted)', display: 'block' }}
          >
            VERDICT
          </span>
        </div>

        <div className="grid grid-cols-2">
          <button
            onClick={() => submitAnswer('real')}
            disabled={locked}
            className="py-7 transition-colors duration-150 active:scale-[0.98] hover:enabled:bg-[rgba(0,229,255,0.07)] disabled:cursor-not-allowed"
            style={{ borderRight: '1px solid var(--border)', background: 'transparent' }}
          >
            <div className="flex flex-col items-center gap-1">
              <span
                className="font-black text-2xl tracking-[0.15em]"
                style={{ color: locked && submitting !== 'real' ? 'rgba(0,229,255,0.18)' : 'var(--cyan)' }}
              >
                REAL
              </span>
              <span style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.2em', color: locked && !submitting ? 'rgba(255,255,255,0.08)' : 'var(--muted)' }}>
                {submitting === 'real' ? 'CHECKING…' : 'AUTHENTIC · [R]'}
              </span>
            </div>
          </button>

          <button
            onClick={() => submitAnswer('fake')}
            disabled={locked}
            className="py-7 transition-colors duration-150 active:scale-[0.98] hover:enabled:bg-[rgba(255,45,92,0.07)] disabled:cursor-not-allowed"
            style={{ background: 'transparent' }}
          >
            <div className="flex flex-col items-center gap-1">
              <span
                className="font-black text-2xl tracking-[0.15em]"
                style={{ color: locked && submitting !== 'fake' ? 'rgba(255,45,92,0.18)' : 'var(--red)' }}
              >
                FAKE
              </span>
              <span style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.2em', color: locked && !submitting ? 'rgba(255,255,255,0.08)' : 'var(--muted)' }}>
                {submitting === 'fake' ? 'CHECKING…' : 'MANIPULATED · [F]'}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 페이지 export (Suspense 필수) ─────────────────────────────────────────────

export default function GamePage() {
  const MONO: React.CSSProperties = { fontFamily: 'var(--font-jetbrains-mono, monospace)' };
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--cyan)' }}
            />
            <span className="text-xs tracking-[0.25em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
              INITIALIZING
            </span>
          </div>
        </div>
      }
    >
      <GameInner />
    </Suspense>
  );
}
