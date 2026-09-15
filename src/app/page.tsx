'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROUND_OPTIONS = [5, 10, 15];
const MONO: React.CSSProperties = { fontFamily: 'var(--font-jetbrains-mono, monospace)' };

type Difficulty = 'easy' | 'medium' | 'hard' | 'all';
const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; sub: string; color: string }[] = [
  { value: 'easy',   label: 'EASY',   sub: '쉬움',   color: '#00E5FF' },
  { value: 'medium', label: 'MEDIUM', sub: '보통',   color: '#FFB800' },
  { value: 'hard',   label: 'HARD',   sub: '어려움', color: '#FF2D5C' },
  { value: 'all',    label: 'ALL',    sub: '전체',   color: 'var(--muted)' },
];

/* ── SVG 일러스트 ─────────────────────────────────────────────────────────── */

/** 중앙: 얼굴 탐지 + AI 경고 */
function FaceDetectSVG() {
  return (
    <svg width="200" height="222" viewBox="0 0 148 164" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Detection frame corners */}
      <path d="M8 8 L8 24 M8 8 L24 8"         stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.65"/>
      <path d="M140 8 L140 24 M140 8 L124 8"  stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.65"/>
      <path d="M8 144 L8 128 M8 144 L24 144"  stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.65"/>
      <path d="M140 144 L140 128 M140 144 L124 144" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.65"/>

      {/* Face circle */}
      <circle cx="74" cy="80" r="48" stroke="rgba(0,229,255,0.13)" strokeWidth="1"/>

      {/* Eye sockets */}
      <ellipse cx="57" cy="73" rx="9" ry="6.5" stroke="rgba(0,229,255,0.5)" strokeWidth="1.3"/>
      <ellipse cx="91" cy="73" rx="9" ry="6.5" stroke="rgba(0,229,255,0.5)" strokeWidth="1.3"/>
      <circle cx="57" cy="73" r="3" fill="rgba(0,229,255,0.38)"/>
      <circle cx="91" cy="73" r="3" fill="rgba(0,229,255,0.38)"/>

      {/* Nose */}
      <path d="M74 84 L69 98 L79 98" fill="none" stroke="rgba(0,229,255,0.22)" strokeWidth="1"/>
      {/* Mouth */}
      <path d="M62 111 Q74 119 86 111" fill="none" stroke="rgba(0,229,255,0.22)" strokeWidth="1.3" strokeLinecap="round"/>

      {/* Landmark dots */}
      <circle cx="57" cy="73" r="1.8" fill="#00E5FF" opacity="0.55"/>
      <circle cx="91" cy="73" r="1.8" fill="#00E5FF" opacity="0.55"/>
      <circle cx="74" cy="98" r="1.5" fill="#00E5FF" opacity="0.35"/>
      <circle cx="62" cy="111" r="1.5" fill="#00E5FF" opacity="0.35"/>
      <circle cx="86" cy="111" r="1.5" fill="#00E5FF" opacity="0.35"/>
      <circle cx="38"  cy="80" r="1.5" fill="#00E5FF" opacity="0.22"/>
      <circle cx="110" cy="80" r="1.5" fill="#00E5FF" opacity="0.22"/>

      {/* Mesh lines */}
      <line x1="57" y1="73" x2="91"  y2="73"  stroke="rgba(0,229,255,0.09)" strokeWidth="0.8"/>
      <line x1="57" y1="73" x2="74"  y2="98"  stroke="rgba(0,229,255,0.09)" strokeWidth="0.8"/>
      <line x1="91" y1="73" x2="74"  y2="98"  stroke="rgba(0,229,255,0.09)" strokeWidth="0.8"/>
      <line x1="74" y1="98" x2="62"  y2="111" stroke="rgba(0,229,255,0.09)" strokeWidth="0.8"/>
      <line x1="74" y1="98" x2="86"  y2="111" stroke="rgba(0,229,255,0.09)" strokeWidth="0.8"/>
      <line x1="57" y1="73" x2="38"  y2="80"  stroke="rgba(0,229,255,0.06)" strokeWidth="0.8"/>
      <line x1="91" y1="73" x2="110" y2="80"  stroke="rgba(0,229,255,0.06)" strokeWidth="0.8"/>

      {/* Animated red scan line */}
      <line x1="8" y1="0" x2="140" y2="0" stroke="rgba(255,45,92,0.55)" strokeWidth="1" strokeDasharray="5 3">
        <animateTransform attributeName="transform" type="translate" values="0,30; 0,145" dur="3s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.07;0.93;1" dur="3s" repeatCount="indefinite"/>
      </line>

      {/* Warning triangle */}
      <polygon points="128,4 141,26 115,26" fill="rgba(255,45,92,0.1)" stroke="#FF2D5C" strokeWidth="1.5"/>
      <text x="128" y="22" textAnchor="middle" fill="#FF2D5C" fontSize="10" fontFamily="monospace" fontWeight="bold">!</text>

      {/* Bottom status strip */}
      <rect x="8" y="152" width="132" height="13" rx="2" fill="rgba(255,45,92,0.07)" stroke="rgba(255,45,92,0.2)" strokeWidth="1"/>
      <text x="74" y="162" textAnchor="middle" fill="#FF2D5C" fontSize="7" fontFamily="monospace" letterSpacing="3">AI WARNING</text>
    </svg>
  );
}

/** 좌측: 생체 신호 파형 — "영상 분석 중" */
function SignalSVG() {
  return (
    <svg width="56" height="222" viewBox="0 0 42 164" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Label */}
      <text x="4" y="11" fill="rgba(0,229,255,0.4)" fontSize="5" fontFamily="monospace" letterSpacing="1">SIG</text>

      {/* Vertical axis */}
      <line x1="10" y1="18" x2="10" y2="148" stroke="rgba(0,229,255,0.12)" strokeWidth="0.8"/>

      {/* Grid ticks */}
      <line x1="8" y1="50"  x2="12" y2="50"  stroke="rgba(0,229,255,0.15)" strokeWidth="0.8"/>
      <line x1="8" y1="82"  x2="12" y2="82"  stroke="rgba(0,229,255,0.15)" strokeWidth="0.8"/>
      <line x1="8" y1="114" x2="12" y2="114" stroke="rgba(0,229,255,0.15)" strokeWidth="0.8"/>

      {/* ECG-style waveform */}
      <polyline
        points="10,82 17,82 20,50 23,114 26,82 30,82 33,38 36,126 39,82 42,82"
        stroke="rgba(0,229,255,0.6)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"
      />

      {/* Animated blink dot — live indicator */}
      <circle cx="10" cy="155" r="2.5" fill="#00E5FF" opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.15;0.7" dur="1.4s" repeatCount="indefinite"/>
      </circle>
      <text x="17" y="158" fill="rgba(0,229,255,0.35)" fontSize="5" fontFamily="monospace">LIVE</text>
    </svg>
  );
}

/** 우측: 이상 탐지 바 — "데이터 분석 결과" */
function AnomalyBarsSVG() {
  const bars: { w: number; isAnomaly?: boolean }[] = [
    { w: 36 }, { w: 22 }, { w: 40, isAnomaly: true },
    { w: 28 }, { w: 38 }, { w: 16 },
    { w: 42, isAnomaly: true }, { w: 30 }, { w: 20 },
    { w: 38 }, { w: 44, isAnomaly: true }, { w: 26 },
    { w: 34 }, { w: 18 }, { w: 40 },
  ];

  return (
    <svg width="56" height="222" viewBox="0 0 44 164" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Label */}
      <text x="0" y="11" fill="rgba(0,229,255,0.4)" fontSize="5" fontFamily="monospace" letterSpacing="0.5">DATA</text>

      {/* Bars */}
      {bars.map((bar, i) => (
        <rect
          key={i}
          x="0" y={18 + i * 8.5} width={bar.w} height="5" rx="1.5"
          fill={bar.isAnomaly ? 'rgba(255,45,92,0.35)' : 'rgba(0,229,255,0.18)'}
        />
      ))}

      {/* Anomaly label */}
      <text x="0" y="152" fill="rgba(255,45,92,0.45)" fontSize="5" fontFamily="monospace">ANOMALY</text>
      <text x="0" y="161" fill="rgba(255,45,92,0.6)" fontSize="5" fontFamily="monospace">DETECTED</text>
    </svg>
  );
}

/* ── 페이지 ───────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();
  const [rounds, setRounds] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('all');

  const start = () => router.push(`/game?rounds=${rounds}&difficulty=${difficulty}`);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16 gap-10 relative"
      style={{ background: 'var(--background)' }}
    >
      {/* Background dot grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,229,255,0.055) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          zIndex: 0,
        }}
      />
      {/* Vignette */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 70% at 50% 50%, transparent 30%, var(--background) 100%)',
          zIndex: 0,
        }}
      />

      <div className="relative z-10 w-full flex flex-col items-center gap-10">

        {/* ── Title ── */}
        <div className="text-center space-y-4 animate-slide-up">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-10" style={{ background: 'var(--cyan)', opacity: 0.4 }} />
            <span className="text-xs tracking-[0.3em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
              FORENSIC ANALYSIS SYSTEM
            </span>
            <div className="h-px w-10" style={{ background: 'var(--cyan)', opacity: 0.4 }} />
          </div>

          <h1
            className="font-black leading-none tracking-tight animate-glitch"
            style={{ fontSize: 'clamp(3rem, 12vw, 5.5rem)', color: 'var(--foreground)' }}
          >
            DEEPFAKE
            <br />
            <span style={{ color: 'var(--cyan)' }}>FORENSICS</span>
          </h1>

          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            AI가 만든 가짜 영상을 탐지하라 — 당신의 눈을 믿을 수 있는가?
          </p>
        </div>

        {/* ── Illustration row ── */}
        <div
          className="flex items-center gap-5 animate-slide-up"
          style={{ animationDelay: '80ms' }}
        >
          <div className="opacity-50 hidden sm:block">
            <SignalSVG />
          </div>
          <FaceDetectSVG />
          <div className="opacity-50 hidden sm:block">
            <AnomalyBarsSVG />
          </div>
        </div>

        {/* ── Config panel ── */}
        <div className="w-full max-w-sm space-y-6 animate-slide-up" style={{ animationDelay: '160ms' }}>

          {/* Difficulty */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-3.5 rounded-full" style={{ background: 'var(--cyan)' }} />
              <span className="text-xs tracking-[0.2em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
                DIFFICULTY
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {DIFFICULTY_OPTIONS.map(({ value, label, sub, color }) => {
                const active = difficulty === value;
                return (
                  <button
                    key={value}
                    onClick={() => setDifficulty(value)}
                    className="py-3 flex flex-col items-center gap-0.5 transition-all duration-150 active:scale-95"
                    style={{
                      border: `1px solid ${active ? color : 'var(--border)'}`,
                      background: active ? `${color}18` : 'var(--surface)',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ ...MONO, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: active ? color : 'var(--muted)' }}>
                      {label}
                    </span>
                    <span style={{ ...MONO, fontSize: '0.55rem', color: active ? color : 'var(--muted)', opacity: 0.7 }}>
                      {sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rounds */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-3.5 rounded-full" style={{ background: 'var(--cyan)' }} />
              <span className="text-xs tracking-[0.2em] uppercase" style={{ ...MONO, color: 'var(--muted)' }}>
                ROUND COUNT
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ROUND_OPTIONS.map((n) => {
                const active = rounds === n;
                return (
                  <button
                    key={n}
                    onClick={() => setRounds(n)}
                    className="py-4 transition-all duration-150 active:scale-95"
                    style={{
                      border: `1px solid ${active ? 'var(--cyan)' : 'var(--border)'}`,
                      background: active ? 'var(--cyan-dim)' : 'var(--surface)',
                      borderRadius: '6px',
                      ...MONO,
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: active ? 'var(--cyan)' : 'var(--muted)',
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start */}
          <button
            onClick={start}
            className="w-full py-4 font-bold tracking-[0.2em] uppercase transition-all duration-150 active:scale-95 hover:brightness-110"
            style={{
              background: 'var(--cyan)',
              color: '#06080D',
              borderRadius: '6px',
              ...MONO,
              fontSize: '0.95rem',
            }}
          >
            START
          </button>
        </div>

        {/* ── Footer ── */}
        <p className="text-xs" style={{ ...MONO, color: 'var(--muted)', opacity: 0.4 }}>
          DEEPFAKE FORENSICS · v1.0
        </p>

      </div>
    </div>
  );
}
