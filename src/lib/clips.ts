import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { Difficulty, VideoClip } from '@/types/game';
import { clipText } from '@/lib/clipTemplates';
import { scanDatasets, tokenFor } from '@/lib/datasets';

/** 기본 영상 해설. 정답이 들어 있으므로 public/이 아닌 서버 전용 위치에 둔다. */
const VIDEOS_JSON = path.resolve(process.cwd(), 'src', 'data', 'videos.json');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

/** public/videos의 기본 영상 (파일이 실제로 있는 것만) */
function loadPublicClips(): VideoClip[] {
  if (!existsSync(VIDEOS_JSON)) return [];
  const data = JSON.parse(readFileSync(VIDEOS_JSON, 'utf8')) as { videos: VideoClip[] };
  return data.videos
    .filter((v) => v.src.startsWith('/videos/') && existsSync(path.join(PUBLIC_DIR, v.src)))
    // videos.json의 id(fake_easy_001 등)는 정답이 드러나므로 브라우저에는 해시를 보낸다
    .map((v) => ({ ...v, id: tokenFor(`public${v.src}`) }));
}

/** Datasets 폴더 영상 (주소는 /api/video/<해시>라 파일 이름이 드러나지 않음) */
function loadDatasetClips(): VideoClip[] {
  return scanDatasets().map(({ token, source, difficulty, note }) => {
    const { label, technique } = source;
    return {
      id: token,
      src: `/api/video/${token}`,
      label,
      // 분류할 때 본 단서(note)만 이 영상의 단서로 쓴다
      ...clipText(label, { difficulty, technique, note }),
      difficulty,
      technique,
    };
  });
}

/** 출제할 수 있는 모든 영상 (정답 포함 — 서버에서만 쓴다) */
export function loadAllClips(difficulty?: Difficulty): VideoClip[] {
  const all = [...loadPublicClips(), ...loadDatasetClips()];
  return difficulty ? all.filter((c) => !c.difficulty || c.difficulty === difficulty) : all;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 섞은 뒤 난이도별로 번갈아 늘어놓는다. 앞에서부터 뽑으면 쉬움·보통·어려움이 고르게 나온다
 * (난이도 '전체'에서 영상 수가 많은 어려움이 몰려 나오지 않도록).
 */
function mixDifficulties(clips: VideoClip[]): VideoClip[] {
  const buckets = new Map<string, VideoClip[]>();
  for (const c of shuffle(clips)) {
    const key = c.difficulty ?? 'any';
    buckets.set(key, [...(buckets.get(key) ?? []), c]);
  }
  const lists = shuffle([...buckets.values()]);
  const out: VideoClip[] = [];
  for (let i = 0; out.length < clips.length; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

/** 깨진 영상을 바꿔 끼울 같은 라벨의 예비 영상 수 */
const ALTERNATES_PER_ROUND = 2;

/**
 * REAL과 FAKE가 최대한 반반이 되도록 count라운드를 뽑는다. 한쪽이 모자라면 다른 쪽으로 채운다.
 * 라운드마다 같은 라벨의 예비 영상을 붙여 둔다 (브라우저는 라벨을 몰라도 같은 쪽으로 교체 가능).
 */
export function pickRounds(clips: VideoClip[], count: number): VideoClip[][] {
  const real = mixDifficulties(clips.filter((c) => c.label === 'real'));
  const fake = mixDifficulties(clips.filter((c) => c.label === 'fake'));
  const n = Math.min(count, clips.length);
  // 홀수 라운드일 때 남는 한 개를 어느 쪽에 줄지는 무작위
  const half = Math.random() < 0.5 ? Math.floor(n / 2) : Math.ceil(n / 2);
  const realCount = Math.max(n - fake.length, Math.min(half, real.length));

  const rounds = [...real.slice(0, realCount).map((c) => [c]), ...fake.slice(0, n - realCount).map((c) => [c])];
  const spare = { real: real.slice(realCount), fake: fake.slice(n - realCount) };
  for (const round of rounds) {
    round.push(...spare[round[0].label].splice(0, ALTERNATES_PER_ROUND));
  }
  return shuffle(rounds);
}
