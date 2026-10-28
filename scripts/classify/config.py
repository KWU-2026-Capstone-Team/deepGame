"""자동 난이도 분류 설정. 모델을 바꿀 때는 이 파일만 고치면 된다."""

from detectors import CustomDetector, HuggingFaceImageDetector  # noqa: F401

# ── 사용할 탐지 모델 ────────────────────────────────────────────────────────────
# 지금은 공개된 가벼운 모델(ViT, 약 340MB, 처음 실행할 때 자동 다운로드)을 임시로 쓴다.
# 우리 모델로 바꾸려면 detectors/custom.py를 채우고 아래 줄을 바꾼다:
#   DETECTOR = CustomDetector("models/our_model.pt")
DETECTOR = HuggingFaceImageDetector("dima806/deepfake_vs_real_image_detection", fake_label="Fake")

# ── 난이도 기준 ────────────────────────────────────────────────────────────────
# 모델이 매긴 '가짜 확률'로 난이도를 정한다.
#   AI도 쉽게 잡은 가짜(확률 높음) = 쉬움, AI도 속은 가짜(확률 낮음) = 어려움
# 모델을 바꾸면 점수 분포가 달라지므로 기준도 다시 맞춰야 한다 (--calibrate 참고).
EASY_MIN = 0.785   # 이 값 이상이면 쉬움 (임시 모델 기준, 손 분류 383개로 맞춤)
MEDIUM_MIN = 0.476 # 이 값 이상이면 보통, 미만이면 어려움

# ── 분류할 영상 ────────────────────────────────────────────────────────────────
# src/lib/datasets.ts의 SOURCES 중 FAKE 폴더와 맞춰 둔다 (Datasets/ 기준 경로)
FAKE_DIRS = ["end_to_end_level_1", "end_to_end_level_2"]

# REAL 영상 폴더 (--real). 진짜 영상은 반대로 'AI가 가짜로 착각한 진짜 = 어려움'.
# 기준값 대신 점수 순으로 3등분해 쉬움·보통·어려움을 같은 수로 나눈다.
REAL_DIRS = ["ffpp/original_sequences"]

# 영상 하나당 뽑을 장면 수 (많을수록 정확하지만 느림)
FRAMES_PER_VIDEO = 8
