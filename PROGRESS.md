# 딥페이크 탐지 게임 — 진행 현황

## 완료된 작업

- 랜딩(`/`), 게임(`/game`), 결과(`/result`) 페이지
- 기본 영상 24개 (`public/videos/`, 정답·해설은 서버 전용 `src/data/videos.json`)
- `Datasets/` 폴더 영상 자동 출제 + 스트리밍 (`/api/video/...`)
- 정답 판정을 서버로 이동 (`/api/game`, `/api/game/answer`), 보안 헤더, Next.js 16.4.0 보안 업데이트
- REAL/FAKE 반반 출제, 목록 로드 실패 시 안내 화면
- 결과 화면에 평균 판별 시간 표시
- 재생할 수 없는 영상은 예비 영상으로 교체하거나 라운드에서 제외
- 영상 주소에 파일 이름(정답)이 드러나지 않도록 해시 주소 사용
- FAKE 383개 난이도 손 분류 (`src/data/fakeLevels.json`) + 새 영상 자동 분류 스크립트 (`npm run classify-fakes`)
- 모든 영상을 웹용 형식으로 변환 (`npm run convert-videos`)

## 남은 작업

- `Datasets/` 영상을 넣은 뒤 REAL·FAKE 영상의 화질·해상도·구도가 비슷한지 직접 확인
  (출처가 달라 화면 느낌만으로 정답을 맞힐 수 있으면 같은 출처의 REAL 영상으로 교체)
- 자동 분류된 FAKE와 REAL 영상의 해설은 템플릿이라 영상마다 실제 단서와 다를 수 있음
- 우리 팀 탐지 모델을 `scripts/classify/detectors/custom.py`에 연결
- 배포 시에는 `Datasets/` 영상이 나오지 않음 (로컬 실행 전용)

---

## 게임 구조

```
랜딩 페이지 (/)
  └─ 난이도 선택: 쉬움 / 보통 / 어려움 / 전체
  └─ 라운드 수: 5 / 10 / 15
  └─ 시작 버튼 → /game?difficulty=medium&rounds=10

게임 화면 (/game)
  └─ 헤더: 라운드 카운터 / 점수 / 연속 정답
  └─ 영상 플레이어 (자동 재생, 음소거, 다시 보기 1회)
  └─ [REAL] [FAKE] 버튼 (타이머 없음)
  └─ 정답 공개 패널 → 다음 라운드 (클릭 또는 Space)
  └─ 마지막 라운드 → /result

결과 화면 (/result)
  └─ 등급 (S/A/B/C/D)
  └─ 최종 점수 (카운트업 애니메이션)
  └─ 정답 수 / 정확도 / 최대 연속 / 평균 시간
  └─ 라운드별 정답/오답 로그
```

## 점수 체계

| 조건 | 점수 |
|---|---|
| 정답 | +100 |
| 직전까지 연속 정답 n개 | +10×n 추가 |
| 오답 | 0점, 연속 리셋 |

---

## 기본 영상 추가 방법 (videos.json 포맷)

`public/videos/`에 파일을 넣고 `src/data/videos.json`에 항목을 추가합니다.

```json
{
  "id": "고유_ID",
  "src": "/videos/파일명.mp4",
  "label": "real",
  "explanation": "정답 공개 시 보여줄 한국어 설명",
  "cues": ["판별 단서1", "판별 단서2", "판별 단서3"],
  "difficulty": "easy",
  "technique": null
}
```

파일 이름에는 real/fake처럼 정답이 드러나는 단어를 넣지 마세요 (영상 주소로 보입니다).

`label`: `"real"` 또는 `"fake"`
`difficulty`: `"easy"`, `"medium"`, `"hard"`
`technique`: Deepfakes 등 조작 기법 이름, REAL이면 `null`

해설 없이 영상만 추가하려면 `Datasets/` 폴더를 쓰면 됩니다 (README 참고).
