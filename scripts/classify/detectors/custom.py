"""우리 팀 모델: 공간(ConvNeXt 5개) × 시공간(입 영역 3D-CNN 6개) 이중브랜치 딥페이크 판별기.

원본: AI-Generated-Media-Detection 저장소 seelhwan 브랜치 deepfake_detector/ (adc8b7a, 2026-07-30)
가중치와 infer.py는 scripts/classify/models/deepfake_detector/ 에 둔다 (용량이 커서 git에는 안 올림).

학습·Service(deeptector-backend)와 같은 방식으로 입력을 만든다:
  영상을 total_frames//32 간격으로 훑으며 MTCNN으로 얼굴을 찾고, 위아래 10% 여유를 둔 224×224 crop 16장을 모은다.
  (classify_fakes.py의 Haar crop·8장 추출은 이 모델에선 쓰지 않는다)
점수는 infer.predict()의 fused = (공간 점수 + 보정한 시공간 점수) / 2 이다.
"""

import importlib.util
from pathlib import Path

from PIL import Image

from .base import Detector

MODEL_COMMIT = "adc8b7a"  # 가중치를 바꾸면 이 값도 바꾼다 (저장된 점수를 다시 쓰지 않도록)
MIN_FACES = 4             # Service와 같은 기준: 얼굴이 4장 미만이면 채점하지 않는다


class CustomDetector(Detector):
    name = f"deeptector-dual@{MODEL_COMMIT}"
    wants_face_crops = False
    reads_video = True  # 영상 경로를 직접 받아 MTCNN으로 얼굴을 뽑는다

    def __init__(self, model_dir: str | Path):
        self.model_dir = Path(model_dir).resolve()

    def load(self) -> None:
        import torch
        from facenet_pytorch import MTCNN

        infer_py = self.model_dir / "infer.py"
        if not infer_py.is_file():
            raise FileNotFoundError(f"{infer_py}가 없습니다. 모델 폴더를 확인하세요.")
        spec = importlib.util.spec_from_file_location("deeptector_infer", infer_py)
        self.infer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.infer)

        spatial = sorted((self.model_dir / "models" / "spatial").glob("*.pt"))
        temporal = sorted((self.model_dir / "models" / "temporal").glob("*.pt"))
        if len(spatial) != 5 or len(temporal) != 6:
            raise FileNotFoundError(f"가중치가 모자랍니다: spatial {len(spatial)}/5, temporal {len(temporal)}/6")

        self.torch = torch
        self.device = self._pick_device()
        self.conv = [self._load(p, spatial=True) for p in spatial]
        self.temp = [self._load(p, spatial=False) for p in temporal]
        self.mtcnn = MTCNN(keep_all=False, device="cpu")
        print(f"  가중치 {len(self.conv)}+{len(self.temp)}개, 장치 {self.device}")

    def _pick_device(self) -> str:
        if self.torch.cuda.is_available():
            return "cuda"
        if self.torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _load(self, path: Path, spatial: bool):
        # weights_only=True: .pt 안에 숨은 코드가 실행되지 않도록 텐서·기본 값만 읽는다
        ck = self.torch.load(path, map_location="cpu", weights_only=True)
        if spatial:
            model = self.infer.FaceClassifier(ck.get("backbone", "convnext_tiny.fb_in22k_ft_in1k"))
        else:
            model = self.infer.make_temporal()
        state = {k: (v.float() if self.torch.is_floating_point(v) else v) for k, v in ck["state_dict"].items()}
        model.load_state_dict(state)
        return model.to(self.device).eval()

    def _faces(self, path: Path) -> list[Image.Image]:
        """infer.faces_from_video()와 같은 규칙. MTCNN을 영상마다 새로 만들지 않도록 옮겨 왔다."""
        import cv2

        cap = cv2.VideoCapture(str(path))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        step = max(1, total // 32 if total else 1)
        faces, fi = [], 0
        try:
            while len(faces) < self.infer.T:
                ok, frame = cap.read()
                if not ok:
                    break
                if fi % step == 0:
                    im = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                    boxes, _ = self.mtcnn.detect(im)
                    if boxes is not None and len(boxes):
                        x1, y1, x2, y2 = boxes[0]
                        pad = 0.1 * (y2 - y1)
                        box = (max(0, x1), max(0, y1 - pad), min(im.width, x2), min(im.height, y2 + pad))
                        faces.append(im.crop(box).resize((224, 224)))
                fi += 1
        finally:
            cap.release()
        return faces

    def predict_video(self, path: Path) -> float:
        faces = self._faces(path)
        if len(faces) < MIN_FACES:
            raise ValueError(f"얼굴을 {len(faces)}장만 찾았습니다 (최소 {MIN_FACES}장)")
        try:
            _, _, fused = self.infer.predict(faces, self.conv, self.temp, self.device)
        except (RuntimeError, NotImplementedError):
            if self.device != "mps":
                raise
            # 일부 3D 연산이 Apple GPU(MPS)에서 안 될 때는 CPU로 옮겨 계속한다
            print("  MPS에서 실패해 CPU로 바꿉니다")
            self.device = "cpu"
            self.conv = [m.cpu() for m in self.conv]
            self.temp = [m.cpu() for m in self.temp]
            _, _, fused = self.infer.predict(faces, self.conv, self.temp, self.device)
        return float(fused)

    def predict(self, images: list[Image.Image]) -> float:
        """이미 얼굴 crop(224×224 권장)이 있을 때. 영상 파일이 있으면 predict_video()를 쓴다."""
        if len(images) < MIN_FACES:
            raise ValueError(f"얼굴 이미지가 {len(images)}장뿐입니다 (최소 {MIN_FACES}장)")
        faces = [im.convert("RGB").resize((224, 224)) for im in images[: self.infer.T]]
        _, _, fused = self.infer.predict(faces, self.conv, self.temp, self.device)
        return float(fused)
