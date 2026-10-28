// 모든 브라우저(크롬·사파리·파이어폭스·아이폰)에서 재생되도록 영상을 변환한다.
//   H.264 High 4:2:0 (yuv420p), 소리 제거(게임은 음소거 재생), faststart(앞부분부터 바로 재생)
//
// 사용법: npm run convert-videos   (ffmpeg 필요: brew install ffmpeg)
//
// - Datasets/ 영상: 원본은 Datasets_original/ 같은 경로로 옮겨 두고, 변환본을 원래 자리에 둔다.
// - public/videos/ 영상: 그 자리에서 바꾼다 (원본은 git 기록에 남아 있음).
// - 이미 변환된 영상은 건너뛰므로 영상을 추가할 때마다 다시 돌려도 된다.

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATASETS = path.join(ROOT, 'Datasets');
const BACKUP = path.join(ROOT, 'Datasets_original');
const PUBLIC_VIDEOS = path.join(ROOT, 'public', 'videos');
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v'];

function findVideos(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return findVideos(full);
    return e.isFile() && VIDEO_EXTS.includes(path.extname(e.name).toLowerCase()) ? [full] : [];
  });
}

/** 이미 웹용 형식이면 true (h264 + yuv420p + 소리 없음 + mp4) */
async function isWebReady(file) {
  if (path.extname(file).toLowerCase() !== '.mp4') return false;
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt', '-of', 'json', file,
  ]);
  const streams = JSON.parse(stdout).streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  return video?.codec_name === 'h264' && video?.pix_fmt === 'yuv420p' && !hasAudio;
}

async function convert(file) {
  if (await isWebReady(file)) return 'skip';

  const out = file.replace(/\.[^.]+$/, '.mp4');
  const tmp = `${out}.part`; // .part는 게임이 읽지 않는 확장자
  await run('ffmpeg', [
    '-v', 'error', '-y', '-i', file,
    '-map', '0:v:0', '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // yuv420p는 가로·세로가 짝수여야 함
    '-movflags', '+faststart',
    '-f', 'mp4', tmp,
  ]);

  if (file.startsWith(DATASETS + path.sep)) {
    const backup = path.join(BACKUP, path.relative(DATASETS, file));
    mkdirSync(path.dirname(backup), { recursive: true });
    renameSync(file, backup);
  } else if (file !== out) {
    rmSync(file);
  }
  renameSync(tmp, out);
  return 'converted';
}

const files = [...findVideos(DATASETS), ...findVideos(PUBLIC_VIDEOS)];
const counts = { converted: 0, skip: 0, failed: 0 };
const failed = [];
let next = 0;
let done = 0;

async function worker() {
  while (next < files.length) {
    const file = files[next++];
    try {
      counts[await convert(file)]++;
    } catch (err) {
      counts.failed++;
      failed.push(`${path.relative(ROOT, file)}: ${String(err.stderr || err.message).trim().split('\n')[0]}`);
      rmSync(`${file.replace(/\.[^.]+$/, '.mp4')}.part`, { force: true });
    }
    done++;
    if (done % 20 === 0 || done === files.length) {
      process.stdout.write(`\r${done}/${files.length}`);
    }
  }
}

console.log(`영상 ${files.length}개 확인 중...`);
await Promise.all(Array.from({ length: Math.max(1, Math.floor(cpus().length / 2)) }, worker));
console.log(`\n변환 ${counts.converted} · 이미 변환됨 ${counts.skip} · 실패 ${counts.failed}`);
if (failed.length) {
  console.log('실패한 영상:');
  failed.forEach((f) => console.log(`  ${f}`));
  process.exitCode = 1;
}
