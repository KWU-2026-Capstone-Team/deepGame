# 딥페이크 포렌식 (Deepfake Forensics)

실제 영상과 AI가 생성한 딥페이크 영상을 구분하는 탐지 훈련 게임입니다.

## 소개

FaceForensics++ 데이터셋의 실제 영상과 Deepfakes 기법으로 생성된 조작 영상을 보고, 진짜인지 가짜인지 판별하는 게임입니다. 플레이어는 영상을 보는 동안 언제든 REAL 또는 FAKE를 선택할 수 있으며, 연속 정답 시 콤보 보너스가 부여됩니다.

## 주요 기능

- **24개 영상 클립**: 실제 영상 12개 + 딥페이크 영상 12개 (각 5초)
- **타이머 없음**: 영상 재생 중 언제든 답변 선택 가능
- **라운드 선택**: 5 / 10 / 15 라운드 중 선택
- **콤보 시스템**: 연속 정답 시 추가 점수
- **REAL/FAKE 균형 출제**: 한 게임에서 진짜와 가짜가 최대한 반반으로 나옴
- **결과 리포트**: 정확도 기반 등급(S~D), 평균 판별 시간, 증거 로그 제공
- **키보드 단축키**: `R` = REAL, `F` = FAKE, `Space` = 다음 라운드

## 기술 스택

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Dataset**: FaceForensics++ (FF++) — youtube 원본 + Deepfakes 조작 영상

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속 (이 PC에서만 접속 가능)

같은 와이파이의 폰 등으로 시연하려면 `npm run dev:lan`으로 실행하고 `http://<이 PC의 IP>:3000`으로 접속합니다. 공용 와이파이에서는 다른 사람도 접속할 수 있으니 시연할 때만 쓰세요.

## 데이터셋

영상 클립은 [FaceForensics++](https://github.com/ondyari/FaceForensics) 데이터셋에서 가져왔습니다.

- **실제 영상**: `original_sequences/youtube/c23/videos/` — 12명의 개별 인물
- **딥페이크 영상**: `manipulated_sequences/Deepfakes/c23/videos/` — Deepfakes 오토인코더 기법

데이터셋 원본 파일은 용량 문제로 저장소에 포함되지 않습니다 (`Datasets/` 폴더는 `.gitignore` 처리).

`Datasets/` 아래 폴더에 넣은 영상은 파일 이름과 상관없이 게임이 자동으로 사용합니다 (`src/lib/datasets.ts`의 `SOURCES` 참고).

- `Datasets/end_to_end_level_1/` → FAKE, 보통
- `Datasets/end_to_end_level_2/` → FAKE, 어려움
- `Datasets/ffpp/original_sequences/` → REAL, 게임마다 무작위로 난이도에 같은 개수씩 배정

새 영상을 넣은 뒤에는 아래 명령으로 웹용 형식(H.264 4:2:0, 소리 제거, faststart)으로 변환하세요. 일부 데이터셋 영상(H.264 4:4:4)은 브라우저에서 재생되지 않습니다. 원본은 `Datasets_original/`로 옮겨지고, 이미 변환된 영상은 건너뜁니다 (ffmpeg 필요).

```bash
npm run convert-videos
```

`Datasets/` 영상은 서버가 PC의 파일을 직접 읽어 보내므로 로컬 실행(`npm run dev` / `npm start`)에서만 나옵니다. Vercel 등에 배포하면 `public/videos/`의 기본 영상 24개만 출제됩니다.

## FAKE 영상 난이도 자동 분류

FAKE 영상의 난이도는 `src/data/fakeLevels.json`에 저장됩니다. 지금 있는 383개는 장면을 보고 손으로 분류했고, 새로 넣는 영상은 탐지 모델로 자동 분류할 수 있습니다.
기준: **AI도 쉽게 잡은 가짜 = 쉬움, AI도 속은 가짜 = 어려움**. 모델이 매긴 '가짜 확률' 순으로 줄을 세워 1/3씩 쉬움·보통·어려움으로 나누므로, 세 난이도의 개수가 항상 같고(차이는 최대 1개) 모델을 바꿔도 맞출 기준값이 없습니다. REAL 영상은 미리 분류하지 않고, 게임을 시작할 때마다 무작위로 쉬움·보통·어려움에 같은 개수씩 나눠 넣습니다.

```bash
npm run classify-setup                     # 처음 한 번 (Python 가상환경 + 패키지 설치)
npm run classify-fakes                     # 레벨이 없는 영상 + 자동 분류했던 영상을 함께 순위로 3등분
npm run classify-fakes -- --all            # 손 분류 영상까지 전부 순위로 다시 나눔 (FAKE 전체가 균등해짐)
npm run classify-fakes -- --dry-run        # 파일은 안 바꾸고 결과만 보기
npm run classify-fakes -- --rescore-auto   # 저장된 점수를 쓰지 않고 다시 채점 (모델을 바꿨을 때)
npm run classify-fakes -- --calibrate      # 손 분류 영상을 순위로 나눠 보고 손 분류와 얼마나 일치하는지 출력
```

- 손으로 분류한 항목은 `--all`을 줄 때만 바뀝니다. 그때도 원래 손 분류는 `"manualDifficulty"`에 남고, 바꾸기 전 파일이 `src/data/fakeLevels.backup-날짜.json`으로 백업됩니다.
- 자동 분류한 항목에는 `"source": "auto"`, 점수, 모델 이름이 함께 기록됩니다. 같은 모델의 점수가 있으면 다시 채점하지 않고 그대로 씁니다.
- 필요한 것: Python 3, ffmpeg, 그리고 탐지 모델 가중치(아래).

### 탐지 모델 (우리 팀 이중브랜치 모델)

`scripts/classify/detectors/custom.py`가 AI-Generated-Media-Detection 저장소 `seelhwan` 브랜치의 `deepfake_detector/`(공간 ConvNeXt 5개 + 입 영역 3D-CNN 6개, 커밋 adc8b7a)를 씁니다.
가중치는 약 400MB라 git에 올리지 않으므로, 그 브랜치의 `deepfake_detector/infer.py`와 `deepfake_detector/models/`를 `scripts/classify/models/deepfake_detector/`로 복사해 둡니다.
학습 때와 같게 MTCNN으로 얼굴 16장을 뽑아 `fused` 점수(공간 + 시공간 평균)를 매깁니다. 얼굴을 4장도 못 찾은 영상은 채점하지 않고 건너뜁니다.

1. `npm run classify-setup`을 다시 실행합니다 (timm, facenet-pytorch 추가).
2. `npm run classify-fakes -- --calibrate`로 손 분류와 얼마나 맞는지 확인합니다 (선택).
3. `npm run classify-fakes -- --all`로 전체를 다시 나눕니다. 손 분류를 살리고 새 영상만 나누려면 `--all` 없이 실행합니다.

예전 임시 모델(공개 ViT)로 돌아가려면 `scripts/classify/config.py`의 `DETECTOR` 줄을 주석에 있는 `HuggingFaceImageDetector(...)`로 바꿉니다.

## 보안

- 정답은 서버에만 있습니다. 브라우저는 게임을 시작할 때 영상 주소만 받고, 답을 낸 라운드의 정답·해설만 받습니다 (라운드당 한 번).
- 영상 주소는 파일 경로의 해시라 파일 이름(정답)이 드러나지 않고, `Datasets/` 밖의 파일은 읽을 수 없습니다.
- 기본 보안 헤더(`next.config.ts`)를 붙입니다.
- 점수는 브라우저(sessionStorage)에서 계산합니다. 랭킹을 만들게 되면 점수 계산도 서버로 옮겨야 합니다.
- 기본 영상 24개(`public/videos/`)는 저장소에 포함되어 clone만으로 게임을 해 볼 수 있습니다. 파일 이름은 해시라 정답이 드러나지 않습니다.
- `Datasets/` 영상과 정답 목록(`src/data/fakeLevels.json`)은 git에 올리지 않습니다. 새로 clone한 경우 이 파일들은 팀 내부에서 따로 받아야 합니다.

## 프로젝트 구조

```
deepGame/
├── public/
│   └── videos/          # 기본 5초 클립 24개 (git에 올라가지 않음, 이름은 해시)
├── Datasets/            # 추가 영상 폴더 (git에 올라가지 않음)
├── scripts/
│   ├── convert-videos.mjs  # 영상을 웹용 형식으로 변환 (npm run convert-videos)
│   └── classify/           # FAKE 난이도 자동 분류 (npm run classify-fakes)
│       ├── config.py       # 사용할 모델·분류할 폴더
│       └── detectors/      # 탐지 모델 (custom.py = 우리 모델 자리)
└── src/
    ├── app/
    │   ├── page.tsx                  # 랜딩 페이지
    │   ├── game/page.tsx             # 게임 페이지
    │   ├── result/page.tsx           # 결과 페이지
    │   └── api/
    │       ├── game/route.ts         # 새 게임 시작: 라운드별 영상 주소만 보냄 (정답 없음)
    │       ├── game/answer/route.ts  # 답 확인: 답을 낸 라운드의 정답·해설만 돌려줌
    │       └── video/[id]/route.ts   # Datasets 영상 스트리밍 (id = 파일 경로 해시)
    ├── data/
    │   ├── videos.json       # 기본 영상 24개의 정답·해설 (서버 전용)
    │   └── fakeLevels.json   # FAKE 영상별 난이도 (git에 올라가지 않음)
    ├── lib/
    │   ├── clips.ts          # 출제 영상 목록 + REAL/FAKE 반반 라운드 뽑기
    │   ├── games.ts          # 진행 중인 게임 (정답은 서버 메모리에만)
    │   ├── clipTemplates.ts  # Datasets 영상에 붙는 해설·단서 템플릿
    │   └── datasets.ts       # Datasets 폴더 목록(SOURCES)과 영상 스캔
    └── types/
        └── game.ts           # 타입 정의
```

