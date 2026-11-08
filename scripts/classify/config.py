"""자동 난이도 분류 설정. 모델을 바꿀 때는 이 파일만 고치면 된다."""

from pathlib import Path

from detectors import CustomDetector, HuggingFaceImageDetector  # noqa: F401

# ── 사용할 탐지 모델 ────────────────────────────────────────────────────────────
# 우리 팀 이중브랜치 모델 (공간 ConvNeXt 5개 + 입 영역 3D-CNN 6개, detectors/custom.py).
# 가중치·infer.py는 models/deepfake_detector/ 에 있다 (약 400MB, git에는 안 올림).
DETECTOR = CustomDetector(Path(__file__).parent / "models" / "deepfake_detector")
# 예전 임시 모델(공개 ViT)로 돌아가려면 위 줄 대신:
# DETECTOR = HuggingFaceImageDetector("dima806/deepfake_vs_real_image_detection", fake_label="Fake")

# ── 난이도 기준 ────────────────────────────────────────────────────────────────
# 기준값은 없다. 모델이 매긴 '가짜 확률' 순으로 줄을 세워 1/3씩 쉬움·보통·어려움으로 나눈다.
#   FAKE: AI도 쉽게 잡은 가짜(확률 높음) = 쉬움, AI도 속은 가짜(확률 낮음) = 어려움
# 그래서 모델을 바꿔도 따로 맞출 값이 없다.

# ── 분류할 영상 ────────────────────────────────────────────────────────────────
# src/lib/datasets.ts의 SOURCES 중 FAKE 폴더와 맞춰 둔다 (Datasets/ 기준 경로)
FAKE_DIRS = ["end_to_end_level_1", "end_to_end_level_2"]

# REAL 영상은 분류하지 않는다 (게임을 시작할 때마다 무작위로 난이도에 같은 개수씩 배정).

# 영상 하나당 뽑을 장면 수 (많을수록 정확하지만 느림)
# 우리 모델(CustomDetector)은 이 값을 쓰지 않고, 학습 때처럼 MTCNN 얼굴 16장을 직접 뽑는다.
FRAMES_PER_VIDEO = 8
