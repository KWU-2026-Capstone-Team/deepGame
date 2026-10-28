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
- `Datasets/ffpp/original_sequences/` → REAL, 모든 난이도에서 출제

새 영상을 넣은 뒤에는 아래 명령으로 웹용 형식(H.264 4:2:0, 소리 제거, faststart)으로 변환하세요. 일부 데이터셋 영상(H.264 4:4:4)은 브라우저에서 재생되지 않습니다. 원본은 `Datasets_original/`로 옮겨지고, 이미 변환된 영상은 건너뜁니다 (ffmpeg 필요).

```bash
npm run convert-videos
```

`Datasets/` 영상은 서버가 PC의 파일을 직접 읽어 보내므로 로컬 실행(`npm run dev` / `npm start`)에서만 나옵니다. Vercel 등에 배포하면 `public/videos/`의 기본 영상 24개만 출제됩니다.

## FAKE 영상 난이도 자동 분류

FAKE 영상의 난이도는 `src/data/fakeLevels.json`에 저장됩니다. 지금 있는 383개는 장면을 보고 손으로 분류했고, 새로 넣는 영상은 탐지 모델로 자동 분류할 수 있습니다.
기준: **AI도 쉽게 잡은 가짜 = 쉬움, AI도 속은 가짜 = 어려움** (모델이 매긴 '가짜 확률'로 판단).

```bash
npm run classify-setup                     # 처음 한 번 (Python 가상환경 + 패키지 설치)
npm run classify-fakes                     # 레벨이 없는 영상만 분류해서 fakeLevels.json에 추가
npm run classify-fakes -- --dry-run        # 파일은 안 바꾸고 결과만 보기
npm run classify-fakes -- --rescore-auto   # 자동 분류했던 영상을 다시 분류 (모델을 바꿨을 때)
npm run classify-fakes -- --calibrate      # 손 분류 결과와 비교해 기준값 추천
npm run classify-fakes -- --real           # REAL 영상 난이도 분류 (AI가 가짜로 착각한 진짜 = 어려움, 점수 순 3등분)
```

- 손으로 분류한 항목은 덮어쓰지 않습니다. 자동 분류한 항목에는 `"source": "auto"`, 점수, 모델 이름이 함께 기록됩니다.
- 필요한 것: Python 3, ffmpeg. 임시 모델(ViT, 약 340MB)은 처음 실행할 때 자동으로 내려받습니다.

### 우리 모델로 바꾸기

1. `scripts/classify/detectors/custom.py`의 `load()`(가중치 불러오기)와 `predict()`(이미지 여러 장 → 가짜 확률 0~1)를 채웁니다.
2. `scripts/classify/config.py`에서 `DETECTOR = CustomDetector("모델 파일 경로")`로 바꿉니다.
3. `npm run classify-fakes -- --calibrate`로 점수 분포를 보고 `EASY_MIN`, `MEDIUM_MIN`을 조정합니다.
4. `npm run classify-fakes -- --rescore-auto`로 다시 분류합니다.

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
│       ├── config.py       # 사용할 모델·난이도 기준값
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

