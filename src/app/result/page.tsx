'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { GameSession } from '@/types/game';

interface Grade { letter: string; color: string; rank: string }

function getGrade(accuracy: number): Grade {
  if (accuracy >= 0.9) return { letter: 'S', color: 'var(--cyan)',  rank: 'EXPERT ANALYST' };
  if (accuracy >= 0.7) return { letter: 'A', color: '#39FF14',      rank: 'SENIOR ANALYST' };
  if (accuracy >= 0.5) return { letter: 'B', color: '#0096FF',      rank: 'ANALYST' };
  if (accuracy >= 0.3) return { letter: 'C', color: 'var(--muted)', rank: 'TRAINEE' };
  return                        { letter: 'D', color: 'var(--red)',   rank: 'UNQUALIFIED' };
}

const noopSubscribe = () => () => {};

export default function ResultPage() {
  const router = useRouter();
  // sessionStorage는 브라우저에만 있으므로 외부 저장소로 읽는다 (서버 렌더에서는 undefined = 아직 모름)
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem('gameSession'),
    () => undefined,
  );
  const session = useMemo<GameSession | null>(() => (raw ? JSON.parse(raw) : null), [raw]);
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (raw === null) router.replace('/'); // 저장된 게임이 없으면 홈으로
  }, [raw, router]);

  useEffect(() => {
    if (!session) return;
    const TARGET = session.score;
    const DURATION = 1500;
    const STEPS = 60;
    const increment = TARGET / STEPS;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= TARGET) {
        setDisplayScore(TARGET);
        clearInterval(interval);
      } else {
        setDisplayScore(Math.round(current));
      }
    }, DURATION / STEPS);

    return () => clearInterval(interval);
  }, [session]);

  if (!session) return null;

  const correctCount = session.results.filter((r) => r.correct).length;
  const accuracy     = correctCount / session.totalRounds;
  const grade        = getGrade(accuracy);
  const avgTime      = session.results.reduce((sum, r) => sum + r.timeUsed, 0) / Math.max(session.results.length, 1);

  const MONO: React.CSSProperties = { fontFamily: 'var(--font-jetbrains-mono, monospace)' };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start py-12 px-5 gap-8 max-w-lg mx-auto"
      style={{ background: 'var(--background)' }}
    >
      {/* ── Header label ── */}
      <div className="flex items-center gap-2 w-full animate-slide-up">
        <div className="w-1 h-3 shrink-0" style={{ background: 'var(--cyan)', opacity: 0.6 }} />
        <span className="text-xs tracking-[0.3em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
          FORENSIC REPORT
        </span>
      </div>

      {/* ── Grade ── */}
      <div className="text-center animate-slide-up animate-glitch">
        <div
          className="font-black leading-none"
          style={{ fontSize: 'clamp(6rem, 22vw, 9rem)', color: grade.color }}
        >
          {grade.letter}
        </div>
        <div className="mt-2 tracking-[0.25em] uppercase" style={{ ...MONO, fontSize: '0.6rem', color: grade.color, opacity: 0.8 }}>
          {grade.rank}
        </div>
        <div className="text-xs mt-2 tracking-wider uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
          {session.totalRounds} ROUNDS
        </div>
      </div>

      {/* ── Score ── */}
      <div className="text-center">
        <div
          className="font-bold tabular-nums"
          style={{ ...MONO, fontSize: '2.75rem', color: 'var(--foreground)' }}
        >
          {displayScore.toLocaleString()}
        </div>
        <div className="text-xs mt-1 tracking-[0.2em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
          SCORE
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div
        className="grid grid-cols-4 w-full"
        style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}
      >
        {[
          { value: `${correctCount}/${session.totalRounds}`, label: 'CORRECT' },
          { value: `${Math.round(accuracy * 100)}%`,         label: 'ACCURACY' },
          { value: `×${session.maxStreak}`,                  label: 'MAX STREAK' },
          { value: `${avgTime.toFixed(1)}s`,                 label: 'AVG TIME' },
        ].map((stat, i) => (
          <div
            key={i}
            className="text-center py-5"
            style={{ borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}
          >
            <div className="font-bold tabular-nums" style={{ ...MONO, color: 'var(--foreground)', fontSize: '1.35rem' }}>
              {stat.value}
            </div>
            <div style={{ ...MONO, color: 'var(--muted)', fontSize: '0.6rem', letterSpacing: '0.15em', marginTop: '4px' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Evidence log ── */}
      <div className="w-full space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-3 shrink-0" style={{ background: 'var(--muted)', opacity: 0.4 }} />
          <span className="text-xs tracking-[0.25em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
            EVIDENCE LOG
          </span>
        </div>

        {session.results.map((r, i) => (
          <div
            key={`${r.videoId}-${i}`}
            className="flex items-center justify-between px-4 py-3 animate-slide-left"
            style={{
              border: `1px solid ${r.correct ? 'rgba(0,229,255,0.2)' : 'rgba(255,45,92,0.2)'}`,
              background: r.correct ? 'rgba(0,229,255,0.04)' : 'rgba(255,45,92,0.04)',
              borderRadius: '5px',
              animationDelay: `${i * 50}ms`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-xs tabular-nums w-5 text-right"
                style={{ ...MONO, color: 'var(--muted)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-bold text-sm" style={{ color: r.correct ? 'var(--cyan)' : 'var(--red)' }}>
                {r.correct ? '✓' : '✗'}
              </span>
              <div>
                <span className="font-semibold text-sm" style={{ ...MONO, color: 'var(--foreground)' }}>
                  {r.label === 'real' ? 'REAL' : 'FAKE'}
                </span>
                {!r.correct && r.userAnswer !== null && (
                  <span className="text-xs ml-2" style={{ ...MONO, color: 'var(--muted)' }}>
                    → {r.userAnswer === 'real' ? 'REAL' : 'FAKE'}
                  </span>
                )}
                {r.userAnswer === null && (
                  <span className="text-xs ml-2" style={{ ...MONO, color: 'var(--muted)' }}>
                    TIMEOUT
                  </span>
                )}
              </div>
            </div>
            <span
              className="text-sm tabular-nums font-semibold"
              style={{ ...MONO, color: r.points > 0 ? 'var(--cyan)' : 'var(--muted)' }}
            >
              {r.points > 0 ? `+${r.points}` : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* ── Restart ── */}
      <button
        onClick={() => router.push('/')}
        className="px-12 py-3 transition-all duration-150 active:scale-95 hover:brightness-125"
        style={{
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          borderRadius: '5px',
          ...MONO,
          fontSize: '0.85rem',
          letterSpacing: '0.1em',
          background: 'transparent',
        }}
      >
        ↩ RESTART
      </button>
    </div>
  );
}
