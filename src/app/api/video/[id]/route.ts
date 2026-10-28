import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { findDatasetVideo } from '@/lib/datasets';

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

/** /api/video/<id> — id는 lib/datasets.ts가 만든 해시. 파일 경로를 직접 받지 않는다. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const video = findDatasetVideo(id);
  if (!video || !existsSync(video.filePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }
  const { filePath } = video;

  const stat = statSync(filePath);
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'video/mp4';
  const fileSize = stat.size;
  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    // "bytes=100-200", "bytes=100-" (끝까지), "bytes=-500" (마지막 500바이트) 형식 처리
    const match = /^bytes=(\d*)-(\d*)/.exec(rangeHeader);
    let start = NaN;
    let end = fileSize - 1;
    if (match && match[1] !== '') {
      start = parseInt(match[1], 10);
      if (match[2] !== '') end = Math.min(parseInt(match[2], 10), fileSize - 1);
    } else if (match && match[2] !== '') {
      start = Math.max(fileSize - parseInt(match[2], 10), 0);
    }

    if (Number.isNaN(start) || start >= fileSize || start > end) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const chunkSize = end - start + 1;

    const webStream = Readable.toWeb(
      createReadStream(filePath, { start, end }),
    ) as ReadableStream;

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const webStream = Readable.toWeb(
    createReadStream(filePath),
  ) as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
