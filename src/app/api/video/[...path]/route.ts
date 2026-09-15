import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';

const DATASETS_DIR = path.resolve(process.cwd(), 'Datasets');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;

  for (const seg of segments) {
    if (seg.includes('..') || seg.includes('/') || seg.includes('\\')) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  const filePath = path.join(DATASETS_DIR, ...segments);

  if (!filePath.startsWith(DATASETS_DIR)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!existsSync(filePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const stat = statSync(filePath);
  const fileSize = stat.size;
  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
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
        'Content-Type': 'video/mp4',
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
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
