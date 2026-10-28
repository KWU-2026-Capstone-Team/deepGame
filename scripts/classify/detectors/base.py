"""모든 탐지 모델이 따라야 하는 공통 형식.

새 모델을 넣으려면 이 클래스를 상속해 load()와 predict()만 채우면 된다.
(예시는 detectors/custom.py 참고)
"""

from PIL import Image


class Detector:
    #: 사람이 읽을 이름 (결과 파일에 기록됨)
    name = "base"
    #: True면 얼굴만 잘라낸 이미지를, False면 프레임 전체를 predict()에 넘긴다
    wants_face_crops = True

    def load(self) -> None:
        """모델 가중치를 메모리에 올린다. 영상을 처리하기 전에 한 번만 불린다."""
        raise NotImplementedError

    def predict(self, images: list[Image.Image]) -> float:
        """한 영상에서 뽑은 이미지 여러 장을 받아 '가짜일 확률'(0~1)을 돌려준다.

        1에 가까울수록 모델이 가짜라고 확신한다는 뜻이다.
        """
        raise NotImplementedError
