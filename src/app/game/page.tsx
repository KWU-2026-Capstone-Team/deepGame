'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Label, VideoClip, RoundResult, GameSession } from '@/types/game';

// ── 유틸 ───────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 정답 시 획득 점수. streak은 이번 답변 직전의 연속 정답 수. */
function calcPoints(streak: number): number {
  return 100 + 10 * streak;
}


// ── 게임 본체 ─────────────────────────────────────────────────────────────────

function GameInner() {
  const router = useRouter();
  const params = useSearchParams();
  const totalRounds = parseInt(params.get('rounds') ?? '10', 10);
  const difficultyParam = params.get('difficulty') ?? 'all';

  // ── State ──────────────────────────────────────────────────────────────────
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'watching' | 'revealing'>('loading');
  const [videoEnded, setVideoEnded] = useState(false);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [allResults, setAllResults] = useState<RoundResult[]>([]);
  const [hasReplayed, setHasReplayed] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef          = useRef<HTMLVideoElement>(null);
  const pendingSessionRef = useRef<GameSession | null>(null);
  const startTimeRef      = useRef<number>(0);
  const answeredRef       = useRef(false);

  // mutable snapshot refs — submitAnswer 내 stale state 방지
  const scoreRef        = useRef(0);
  const streakRef       = useRef(0);
  const maxStreakRef    = useRef(0);
  const allResultsRef   = useRef<RoundResult[]>([]);
  const clipsRef        = useRef<VideoClip[]>([]);
  const currentRoundRef = useRef(0);

  useEffect(() => { scoreRef.current       = score;      }, [score]);
  useEffect(() => { streakRef.current      = streak;     }, [streak]);
  useEffect(() => { maxStreakRef.current   = maxStreak;  }, [maxStreak]);
  useEffect(() => { allResultsRef.current  = allResults; }, [allResults]);
  useEffect(() => { clipsRef.current       = clips;      }, [clips]);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);

  // ── 영상 로드 (마운트 1회) ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/data/videos.json')
      .then((r) => r.json())
      .then((data: { videos: VideoClip[] }) => {
        const filtered = difficultyParam === 'all'
          ? data.videos
          : data.videos.filter((v) => v.difficulty === difficultyParam);
        const picked = shuffle(filtered).slice(0, Math.min(totalRounds, filtered.length));
        setClips(picked);
        clipsRef.current = picked;
        setPhase('watching');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 라운드 전환 시 초기화 ──────────────────────────────────────────────────
  useEffect(() => {
    answeredRef.current = false;
    pendingSessionRef.current = null;
    setHasReplayed(false);
    setVideoEnded(false);
  }, [currentRound]);

  // ── 영상 재생 + 시작 시간 기록 (watching 진입 시) ──────────────────────────
  useEffect(() => {
    if (phase !== 'watching' || !videoRef.current) return;
    startTimeRef.current = Date.now();
    videoRef.current.play().catch(() => {});
  }, [currentRound, phase]);


  // ── 답변 처리 ───────────────────────────────────────────────────────────────
  const submitAnswer = useCallback(
    (answer: Label) => {
      if (answeredRef.current) return;
      answeredRef.current = true;

      const clip = clipsRef.current[currentRoundRef.current];
      if (!clip) return;

      const timeUsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      const correct    = answer === clip.label;
      const newStreak  = correct ? streakRef.current + 1 : 0;
      const points     = correct ? calcPoints(streakRef.current) : 0;
      const newScore   = scoreRef.current + points;
      const newMax     = Math.max(maxStreakRef.current, newStreak);

      const result: RoundResult = {
        videoId:    clip.id,
        label:      clip.label,
        userAnswer: answer,
        correct,
        timeUsed,
        points,
      };
      const newAllResults = [...allResultsRef.current, result];

      setScore(newScore);
      setStreak(newStreak);
      setMaxStreak(newMax);
      setLastResult(result);
      setAllResults(newAllResults);
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
    [],
  );

  // ── 라운드 진행 (클릭 또는 스페이스바) ───────────────────────────────────
  const advanceRound = useCallback(() => {
    if (pendingSessionRef.current) {
      sessionStorage.setItem('gameSession', JSON.stringify(pendingSessionRef.current));
      router.push('/result');
    } else {
      setCurrentRound((r) => r + 1);
      setPhase('watching');
    }
  }, [router]);

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
    setHasReplayed(true);
    setVideoEnded(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // ── 로딩 ────────────────────────────────────────────────────────────────────
  const MONO: React.CSSProperties = { fontFamily: 'var(--font-jetbrains-mono, monospace)' };

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

        {/* Forensic monitor frame */}
        <div
          className="relative w-full h-full flex items-center justify-center scanline"
          style={{ borderLeft: '2px solid rgba(0,229,255,0.12)', borderRight: '2px solid rgba(0,229,255,0.12)' }}
        >

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
            poster={clip.poster}
            autoPlay
            muted
            playsInline
            onEnded={() => setVideoEnded(true)}
            className="max-h-[58vh] w-full object-contain"
            style={{ position: 'relative', zIndex: 1 }}
          />
        </div>

        {/* ── Reveal panel (slides up from bottom) ── */}
        {phase === 'revealing' && lastResult && (
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
                  {clip.label === 'real' ? 'REAL (진짜)' : 'FAKE (딥페이크)'}
                </span>
                {clip.technique && (
                  <span style={{ ...MONO, color: 'var(--muted)', fontSize: '0.7rem' }}>
                    · {clip.technique}
                  </span>
                )}
              </div>

              {/* Explanation */}
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                {clip.explanation}
              </p>

              {/* Cue tags */}
              {clip.cues.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {clip.cues.map((cue) => (
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
            disabled={phase === 'revealing'}
            className="py-7 transition-colors duration-150 active:scale-[0.98] hover:enabled:bg-[rgba(0,229,255,0.07)] disabled:cursor-not-allowed"
            style={{ borderRight: '1px solid var(--border)', background: 'transparent' }}
          >
            <div className="flex flex-col items-center gap-1">
              <span
                className="font-black text-2xl tracking-[0.15em]"
                style={{ color: phase === 'revealing' ? 'rgba(0,229,255,0.18)' : 'var(--cyan)' }}
              >
                REAL
              </span>
              <span style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.2em', color: phase === 'revealing' ? 'rgba(255,255,255,0.08)' : 'var(--muted)' }}>
                AUTHENTIC · [R]
              </span>
            </div>
          </button>

          <button
            onClick={() => submitAnswer('fake')}
            disabled={phase === 'revealing'}
            className="py-7 transition-colors duration-150 active:scale-[0.98] hover:enabled:bg-[rgba(255,45,92,0.07)] disabled:cursor-not-allowed"
            style={{ background: 'transparent' }}
          >
            <div className="flex flex-col items-center gap-1">
              <span
                className="font-black text-2xl tracking-[0.15em]"
                style={{ color: phase === 'revealing' ? 'rgba(255,45,92,0.18)' : 'var(--red)' }}
              >
                FAKE
              </span>
              <span style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.2em', color: phase === 'revealing' ? 'rgba(255,255,255,0.08)' : 'var(--muted)' }}>
                MANIPULATED · [F]
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
