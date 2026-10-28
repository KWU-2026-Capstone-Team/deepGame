"""HuggingFace의 이미지 분류 모델을 쓰는 탐지기 (임시 대체 모델)."""

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

from .base import Detector


class HuggingFaceImageDetector(Detector):
    wants_face_crops = True

    def __init__(self, model_id: str, fake_label: str = "Fake", batch_size: int = 16):
        self.model_id = model_id
        self.fake_label = fake_label
        self.batch_size = batch_size
        self.name = f"hf:{model_id}"

    def load(self) -> None:
        if torch.backends.mps.is_available():
            self.device = "mps"
        elif torch.cuda.is_available():
            self.device = "cuda"
        else:
            self.device = "cpu"
        self.processor = AutoImageProcessor.from_pretrained(self.model_id)
        self.model = AutoModelForImageClassification.from_pretrained(self.model_id).to(self.device).eval()
        labels = {v.lower(): int(k) for k, v in self.model.config.id2label.items()}
        if self.fake_label.lower() not in labels:
            raise ValueError(f"모델 라벨 {list(labels)} 에 '{self.fake_label}'가 없습니다")
        self.fake_index = labels[self.fake_label.lower()]

    @torch.no_grad()
    def predict(self, images: list[Image.Image]) -> float:
        probs = []
        for i in range(0, len(images), self.batch_size):
            batch = self.processor(images=images[i:i + self.batch_size], return_tensors="pt").to(self.device)
            logits = self.model(**batch).logits
            probs += logits.softmax(-1)[:, self.fake_index].tolist()
        return sum(probs) / len(probs)
