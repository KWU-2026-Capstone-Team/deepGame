import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import type { Difficulty, Label } from '@/types/game';

export const DATASETS_DIR = path.resolve(process.cwd(), 'Datasets');
const LEVELS_JSON = path.resolve(process.cwd(), 'src', 'data', 'fakeLevels.json');
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v'];

/**
 * Datasets 아래에서 영상을 읽어올 폴더 목록.
 * 폴더 안의 영상 파일은 이름과 상관없이 전부 사용한다.
 * difficulty를 생략한 폴더의 영상은 모든 난이도에서 출제된다.
 */
export const SOURCES: { dir: string; label: Label; difficulty?: Difficulty; technique?: string }[] = [
  { dir: 'end_to_end_level_1', label: 'fake', difficulty: 'medium', technique: 'End-to-End' },
  { dir: 'end_to_end_level_2', label: 'fake', difficulty: 'hard',   technique: 'End-to-End' },
  { dir: 'ffpp/original_sequences', label: 'real' },
];

/**
 * FAKE 영상별 난이도 (src/data/fakeLevels.json — 손 분류 + npm run classify-fakes 자동 분류).
 * 키는 Datasets 기준 경로. 여기 없는 영상은 SOURCES의 difficulty를 쓴다.
 * exclude: 얼굴이 안 나오는 등 게임에 쓸 수 없는 영상
 * 정답 목록이라 git에는 올리지 않는다 (.gitignore). 파일이 없으면 폴더 기준 난이도만 쓴다.
 */
type LevelEntry = { difficulty?: Difficulty; exclude?: boolean; note?: string };

export interface DatasetVideo {
  /** 브라우저에 노출되는 영상 ID. 파일 경로의 해시라 이름(정답)이 드러나지 않는다. */
  token: string;
  filePath: string;
  source: (typeof SOURCES)[number];
  /** 폴더 안에서 이름순 위치 (해설 템플릿 선택용) */
  index: number;
  difficulty?: Difficulty;
  /** 분류할 때 본 눈에 띄는 단서 */
  note?: string;
}

function mtime(p: string): number {
  return existsSync(p) ? statSync(p).mtimeMs : 0;
}

function listVideos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && VIDEO_EXTS.includes(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
}

export function tokenFor(relPath: string): string {
  return createHash('sha256').update(relPath).digest('hex').slice(0, 16);
}

function loadLevels(): Record<string, LevelEntry> {
  if (!existsSync(LEVELS_JSON)) return {};
  return JSON.parse(readFileSync(LEVELS_JSON, 'utf8'));
}

function sourceDir(source: (typeof SOURCES)[number]): string {
  return path.join(DATASETS_DIR, ...source.dir.split('/'));
}

// 영상 요청마다 폴더 전체를 다시 읽지 않도록, 폴더·레벨 파일이 바뀌었을 때만 다시 읽는다.
let cache: { signature: string; videos: DatasetVideo[]; byToken: Map<string, DatasetVideo> } | null = null;

function signature(): string {
  return [...SOURCES.map((s) => mtime(sourceDir(s))), mtime(LEVELS_JSON)].join(',');
}

export function scanDatasets(): DatasetVideo[] {
  const sig = signature();
  if (cache?.signature === sig) return cache.videos;

  const levels = loadLevels();
  const videos: DatasetVideo[] = [];
  for (const source of SOURCES) {
    const dir = sourceDir(source);
    listVideos(dir).forEach((name, index) => {
      const relPath = `${source.dir}/${name}`;
      const level = levels[relPath];
      if (level?.exclude) return;
      videos.push({
        token: tokenFor(relPath),
        filePath: path.join(dir, name),
        source,
        index,
        difficulty: level?.difficulty ?? source.difficulty,
        note: level?.note,
      });
    });
  }
  cache = { signature: sig, videos, byToken: new Map(videos.map((v) => [v.token, v])) };
  return videos;
}

export function findDatasetVideo(token: string): DatasetVideo | undefined {
  scanDatasets();
  return cache?.byToken.get(token);
}
