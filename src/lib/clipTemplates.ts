import type { Difficulty, Label } from '@/types/game';

/**
 * Datasets 폴더에서 자동으로 읽은 영상의 해설.
 * 영상을 하나하나 보고 쓴 글이 아니므로, 해설과 단서(cues)에는 그 영상에 대해 확인된 사실만 쓴다.
 * 영상과 상관없는 일반적인 요령은 tips로 따로 보여 준다 (영상은 음소거로 재생되므로 소리 관련 요령은 쓰지 않는다).
 */
export interface ClipText { explanation: string; cues: string[]; tips: string[] }

const FAKE_TIPS = ['얼굴 경계·헤어라인의 번짐', '얼굴과 목의 색 차이', '눈·입 주변의 일그러짐', '움직일 때 피부 질감의 흔들림'];
const REAL_TIPS = ['눈 깜빡임과 표정이 얼굴 전체로 이어지는지', '얼굴과 목·배경의 조명이 같은지', '움직여도 얼굴 경계가 그대로인지'];

const FAKE_NO_NOTE: Record<Difficulty, string> = {
  easy:   '눈에 띄는 합성 흔적이 비교적 많은 영상입니다.',
  medium: '합성 흔적이 크지 않아 자세히 봐야 보이는 영상입니다.',
  hard:   '뚜렷한 합성 흔적이 거의 없는 고품질 영상이라 사람 눈으로는 구분하기 매우 어렵습니다.',
};

const REAL_BY_LEVEL: Record<Difficulty, string> = {
  easy:   '',
  medium: '',
  hard:   ' AI 탐지 모델도 가짜로 의심한 영상입니다. 압축 노이즈나 조명 때문에 진짜도 가짜처럼 보일 수 있습니다.',
};

export function clipText(
  label: Label,
  opts: { difficulty?: Difficulty; technique?: string; note?: string },
): ClipText {
  if (label === 'real') {
    const extra = opts.difficulty ? REAL_BY_LEVEL[opts.difficulty] : '';
    return {
      explanation: `합성하지 않은 실제 촬영 영상입니다 (FaceForensics++ 원본).${extra}`,
      cues: [],
      tips: REAL_TIPS,
    };
  }
  const method = opts.technique ? `${opts.technique} 방식으로 얼굴을 합성한 딥페이크입니다.` : '얼굴을 합성한 딥페이크입니다.';
  if (opts.note) {
    return { explanation: `${method} 이 영상의 단서: ${opts.note}.`, cues: [opts.note], tips: FAKE_TIPS };
  }
  const detail = opts.difficulty ? FAKE_NO_NOTE[opts.difficulty] : '';
  return { explanation: `${method} ${detail}`.trim(), cues: [], tips: FAKE_TIPS };
}
