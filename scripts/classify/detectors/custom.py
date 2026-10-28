"""우리 팀 모델을 넣는 자리.

1. 아래 TODO 두 곳을 채운다.
2. scripts/classify/config.py에서 DETECTOR를 CustomDetector(...)로 바꾼다.
3. npm run classify-fakes -- --rescore-auto 로 자동 분류를 다시 돌린다.
"""

from PIL import Image

from .base import Detector


class CustomDetector(Detector):
    name = "custom"
    # 우리 모델이 얼굴 crop이 아니라 프레임 전체를 받는다면 False로 바꾼다
    wants_face_crops = True

    def __init__(self, weights_path: str):
        self.weights_path = weights_path

    def load(self) -> None:
        # TODO: 가중치 불러오기. 예)
        #   import torch
        #   model = OurModel()                      # 모델 구조 클래스
        #   model.load_state_dict(torch.load(self.weights_path, map_location="cpu", weights_only=True))
        #   self.model = model.eval()
        # ⚠ weights_only=True를 빼면 .pt 파일 안에 숨은 코드가 실행될 수 있다. 출처를 모르는 파일은 열지 말 것.
        # 가능하면 .safetensors 형식으로 저장해 쓰는 것이 가장 안전하다.
        # 또는 ONNX:
        #   import onnxruntime as ort
        #   self.session = ort.InferenceSession(self.weights_path)
        raise NotImplementedError("detectors/custom.py의 load()를 채워 주세요")

    def predict(self, images: list[Image.Image]) -> float:
        # TODO: 이미지 전처리(크기·정규화) → 모델 실행 → 이미지별 '가짜 확률'의 평균을 돌려준다
        raise NotImplementedError("detectors/custom.py의 predict()를 채워 주세요")
