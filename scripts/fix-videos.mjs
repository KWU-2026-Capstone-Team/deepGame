import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const videosJsonPath = join(__dirname, '..', 'public', 'data', 'videos.json');
const existing = JSON.parse(readFileSync(videosJsonPath, 'utf8'));

// 깨진 l1_medium_*, l2_hard_*, real_ffpp_* 항목 제거
existing.videos = existing.videos.filter(
  v => !v.id.startsWith('l1_medium_') && !v.id.startsWith('l2_hard_') && !v.id.startsWith('real_ffpp_')
);

// ── level_1 (medium, fake) ──────────────────────────────────────────────────
const level1Files = [
  '000_M101','001_W101','002_M101','003_M101','004_M101',
  '005_W101','006_M131','007_W101','008_W101','009_M131',
  '010_W006','011_M131','012_W006','013_W006','014_M131',
  '015_M109','016_M109','017_W006','018_W007','019_W007',
  '020_M109','021_W007','022_M109','023_M113','024_M113',
];

const mediumFakeTemplates = [
  { explanation: 'End-to-End 방식으로 생성된 딥페이크입니다. 얼굴 경계 부근에 미세한 블러 아티팩트가 보이며, 자연스러운 표정 전환에서 약간의 부자연스러움이 있습니다.', cues: ['경계부 미세 블러', '표정 전환 부자연스러움', '헤어라인 처리 이상'] },
  { explanation: 'End-to-End 딥페이크 기술로 합성된 영상입니다. 빠른 움직임 구간에서 얼굴 텍스처가 약간 흔들리며, 피부 색조의 미세한 불일치가 있습니다.', cues: ['움직임 시 텍스처 흔들림', '피부 색조 불일치', '얼굴 외곽 블러'] },
  { explanation: 'AI 합성 딥페이크입니다. 눈 깜빡임 패턴이 다소 부자연스럽고, 조명 변화 시 얼굴 반응이 원본과 미묘하게 다릅니다.', cues: ['눈 깜빡임 패턴 이상', '조명 반응 불일치', '미세한 합성 흔적'] },
  { explanation: 'End-to-End 딥페이크입니다. 말하는 구간에서 입 주변 텍스처가 약간 부자연스럽고, 음성과의 싱크가 미세하게 어긋납니다.', cues: ['입 주변 텍스처 이상', '립싱크 미세 불일치', '치아 표현 어색함'] },
  { explanation: '딥페이크 합성 영상입니다. 얼굴과 목의 색조 차이가 미묘하게 있으며, 고개를 움직일 때 얼굴 외곽의 처리가 자연스럽지 않습니다.', cues: ['얼굴-목 색조 차이', '고개 움직임 시 외곽 이상', '피부 광택 불일치'] },
];

// ── level_2 (hard, fake) ───────────────────────────────────────────────────
const level2Files = [
  '001_W101','003_M101','005_W101','007_W101','010_W006',
  '013_W006','021_W007','022_M109','023_M113','025_W007',
  '038_W009','050_M115','052_W012','059_M118','075_W014',
  '086_W016','088_W016','092_M120','099_W018','101_W018',
  '104_W018','111_M123','114_M123','116_W132','122_W021',
];

const hardFakeTemplates = [
  { explanation: '고품질 End-to-End 딥페이크입니다. 전반적으로 매우 자연스럽지만, 세밀히 관찰하면 눈동자 반사광의 위치가 미세하게 부자연스럽습니다.', cues: ['눈동자 반사광 이상', '극미세 temporal artifact', '고품질 합성'] },
  { explanation: '최신 기술의 딥페이크 영상입니다. 거의 완벽하게 합성되었으나, 빠른 움직임의 찰나에 프레임 간 불일치가 발생합니다.', cues: ['프레임 간 미세 불일치', '움직임 구간 아티팩트', '고주파 텍스처 패턴'] },
  { explanation: '고도로 정교한 딥페이크입니다. 육안으로는 실제와 구분이 거의 불가능하지만, 피부의 미세한 노이즈 패턴에서 AI 생성 흔적이 있습니다.', cues: ['미세 노이즈 패턴', '피부 텍스처 AI 흔적', '경계부 극미세 블러'] },
  { explanation: 'End-to-End 고품질 딥페이크입니다. 표정과 움직임이 매우 자연스럽지만, 귀와 헤어라인 처리에서 극히 미세한 아티팩트가 있습니다.', cues: ['귀 처리 미세 이상', '헤어라인 극미세 아티팩트', 'temporal consistency 미세 오류'] },
  { explanation: '정교하게 합성된 딥페이크입니다. 대부분의 구간이 완벽하지만, 조명이 급격히 변하는 순간 피부의 광택 반응이 원본과 미세하게 다릅니다.', cues: ['급격한 조명 변화 시 이상', '피부 광택 미세 불일치', '극히 짧은 구간 아티팩트'] },
];

// ── real (ffpp) ────────────────────────────────────────────────────────────
const easyRealFiles   = ['033','035','036','044','097','134','183','192','210','241'];
const mediumRealFiles = ['252','253','266','339','392','469','481','585','599','672'];
const hardRealFiles   = ['720','828','830','866','878','917','924','942','943','945'];

const easyRealTemplates = [
  { explanation: '실제 영상입니다. 눈 깜빡임이 자연스럽고 얼굴 경계가 선명하게 구분됩니다. 피부 텍스처가 조명에 일관되게 반응합니다.', cues: ['자연스러운 눈 깜빡임', '선명한 얼굴 경계', '일관된 피부 텍스처'] },
  { explanation: '실제 영상입니다. 얼굴 외곽선이 자연스럽고 헤어라인과 피부 경계가 명확합니다. 딥페이크 특유의 블러 아티팩트가 없습니다.', cues: ['자연스러운 얼굴 외곽', '명확한 헤어라인', '블러 아티팩트 없음'] },
  { explanation: '실제 영상입니다. 표정이 얼굴 전체 근육에 자연스럽게 전파되며, 조명 반응도 물리적으로 일관됩니다.', cues: ['자연스러운 표정 전파', '물리적 조명 반응', '균일한 피부 색조'] },
  { explanation: '실제 영상입니다. 얼굴-목 연결부가 자연스럽고 색조가 일치합니다. 합성 경계선이 전혀 없습니다.', cues: ['얼굴-목 자연스러운 연결', '균일한 색조', '합성 경계 없음'] },
  { explanation: '실제 영상입니다. 고개를 돌릴 때 귀와 목 부분이 자연스럽게 변형되며, 피부 광택이 일관됩니다.', cues: ['자연스러운 귀-목 처리', '일관된 피부 광택', '움직임 자연스러움'] },
];

const mediumRealTemplates = [
  { explanation: '실제 영상입니다. 빠른 움직임에서도 얼굴 경계가 안정적이며 배경과의 분리가 명확합니다. Temporal consistency가 완벽합니다.', cues: ['안정적인 얼굴 경계', '선명한 배경 분리', 'temporal consistency'] },
  { explanation: '실제 영상입니다. 말하는 동안 입 주변 근육 움직임이 음성과 자연스럽게 동기화되고, 치아 표현이 일관됩니다.', cues: ['자연스러운 입 근육 움직임', '음성-립 동기화', '치아 표현 자연스러움'] },
  { explanation: '실제 영상입니다. 눈동자 움직임이 자연스럽고, 눈의 하이라이트 반사가 물리적으로 일관되게 유지됩니다.', cues: ['자연스러운 눈동자 움직임', '일관된 눈 하이라이트', '자연스러운 시선'] },
  { explanation: '실제 영상입니다. 얼굴 조명이 배경 조명과 일치하고, 그림자 방향이 물리적으로 올바릅니다.', cues: ['조명-배경 일치', '올바른 그림자 방향', '자연스러운 반사'] },
  { explanation: '실제 영상입니다. 미세한 표정 변화가 자연스럽게 연결되며, 피부 미세 텍스처가 일관되게 유지됩니다.', cues: ['미세 표정 자연스러움', '피부 텍스처 일관성', '자연스러운 근육 연결'] },
];

const hardRealTemplates = [
  { explanation: '실제 영상입니다. 고해상도 분석에서도 모든 얼굴 요소가 물리적으로 일관됩니다. 모공, 잔털 등 미세한 피부 디테일이 자연스럽습니다.', cues: ['미세 피부 디테일', '모공 자연스러움', '고해상도 일관성'] },
  { explanation: '실제 영상입니다. 프레임 간 얼굴 요소의 temporal consistency가 완벽합니다. 피부 노이즈 패턴이 자연스러운 랜덤 분포를 보입니다.', cues: ['완벽한 temporal consistency', '자연스러운 노이즈 패턴', '프레임 간 연속성'] },
  { explanation: '실제 영상입니다. 복잡한 조명 환경에서도 얼굴 모든 부위가 물리 법칙에 맞게 반응합니다. 눈 반사 하이라이트 위치가 정확합니다.', cues: ['복잡 조명 일관 반응', '정확한 눈 하이라이트', '물리적 정확성'] },
  { explanation: '실제 영상입니다. 얼굴 외곽 가장자리의 피부-배경 전환이 자연스럽습니다. AI 생성 특유의 고주파 텍스처 반복 패턴이 없습니다.', cues: ['자연스러운 외곽 전환', '고주파 반복 패턴 없음', '자연 피부 텍스처'] },
  { explanation: '실제 영상입니다. 머리카락 한 올 한 올의 물리적 움직임이 자연스럽고 헤어라인 처리가 완벽합니다. 어떤 구간을 봐도 일관성이 유지됩니다.', cues: ['자연스러운 헤어 움직임', '완벽한 헤어라인', '전체 구간 일관성'] },
];

function makeEntries(files, difficulty, label, templates, srcPrefix) {
  const prefix = label === 'fake'
    ? (difficulty === 'medium' ? 'l1_medium_' : 'l2_hard_')
    : `real_ffpp_${difficulty}_`;
  return files.map((name, i) => ({
    id: `${prefix}${name}`,
    src: `${srcPrefix}/${name}.mp4`,
    label,
    explanation: templates[i % templates.length].explanation,
    cues: templates[i % templates.length].cues,
    difficulty,
    technique: label === 'fake' ? 'End-to-End' : null,
  }));
}

const ffppBase = '/api/video/ffpp/original_sequences/youtube/c23/videos';
const l1Base   = '/api/video/end_to_end_level_1';
const l2Base   = '/api/video/end_to_end_level_2';

const newEntries = [
  ...makeEntries(level1Files,    'medium', 'fake', mediumFakeTemplates, l1Base),
  ...makeEntries(level2Files,    'hard',   'fake', hardFakeTemplates,   l2Base),
  ...makeEntries(easyRealFiles,  'easy',   'real', easyRealTemplates,   ffppBase),
  ...makeEntries(mediumRealFiles,'medium', 'real', mediumRealTemplates, ffppBase),
  ...makeEntries(hardRealFiles,  'hard',   'real', hardRealTemplates,   ffppBase),
];

existing.videos.push(...newEntries);
writeFileSync(videosJsonPath, JSON.stringify(existing, null, 2), 'utf8');

const byDiff  = existing.videos.reduce((a,v)=>{ a[v.difficulty]=(a[v.difficulty]||0)+1; return a; }, {});
const byLabel = existing.videos.reduce((a,v)=>{ a[v.label]=(a[v.label]||0)+1; return a; }, {});
console.log(`Added ${newEntries.length} entries. Total: ${existing.videos.length}`);
console.log('By difficulty:', byDiff);
console.log('By label:', byLabel);
