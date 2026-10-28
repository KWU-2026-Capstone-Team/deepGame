"""FAKE 영상의 난이도를 탐지 모델로 자동 분류해 src/data/fakeLevels.json에 기록한다.

  npm run classify-fakes                   # 아직 레벨이 없는 영상만 분류
  npm run classify-fakes -- --rescore-auto # 자동 분류했던 영상도 다시 분류 (모델을 바꿨을 때)
  npm run classify-fakes -- --dry-run      # 파일은 안 바꾸고 결과만 출력
  npm run classify-fakes -- --calibrate    # 손으로 분류한 영상과 비교해 기준값(EASY_MIN 등) 추천
  npm run classify-fakes -- --real         # REAL 영상 난이도 분류 (AI가 가짜로 착각한 진짜 = 어려움)

손으로 분류한 항목("source"가 없는 항목)은 절대 덮어쓰지 않는다.
"""

import argparse
import io
import json
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import config  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATASETS = ROOT / "Datasets"
LEVELS_JSON = ROOT / "src" / "data" / "fakeLevels.json"
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}
FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def list_videos(dirs: list[str]) -> list[str]:
    keys = []
    for d in dirs:
        folder = DATASETS / d
        if folder.is_dir():
            keys += sorted(f"{d}/{p.name}" for p in folder.iterdir()
                           if p.is_file() and p.suffix.lower() in VIDEO_EXTS)
    return keys


def extract_frames(path: Path, count: int) -> list[Image.Image]:
    """영상 전체에서 고르게 count장을 뽑는다 (처음·끝 10%는 건너뜀)."""
    duration = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True).stdout.strip())
    frames = []
    for i in range(count):
        t = duration * (0.1 + 0.8 * i / max(count - 1, 1))
        png = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
             "-f", "image2pipe", "-vcodec", "png", "-"],
            capture_output=True, check=True).stdout
        if png:
            frames.append(Image.open(io.BytesIO(png)).convert("RGB"))
    return frames


def crop_face(frame: Image.Image) -> Image.Image:
    """가장 큰 얼굴을 여유 있게 잘라낸다. 얼굴을 못 찾으면 가운데를 정사각형으로 자른다."""
    gray = cv2.cvtColor(np.asarray(frame), cv2.COLOR_RGB2GRAY)
    faces = FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    w, h = frame.size
    if len(faces):
        x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        cx, cy, side = x + fw / 2, y + fh / 2, max(fw, fh) * 1.4
    else:
        cx, cy, side = w / 2, h / 2, min(w, h)
    half = side / 2
    box = (max(0, cx - half), max(0, cy - half), min(w, cx + half), min(h, cy + half))
    return frame.crop(tuple(int(v) for v in box))


def to_level(score: float) -> str:
    if score >= config.EASY_MIN:
        return "easy"
    if score >= config.MEDIUM_MIN:
        return "medium"
    return "hard"


def score_videos(keys: list[str], show_level: bool = True) -> dict[str, float]:
    detector = config.DETECTOR
    print(f"모델 불러오는 중: {detector.name}")
    detector.load()
    scores = {}
    start = time.time()
    for n, key in enumerate(keys, 1):
        try:
            frames = extract_frames(DATASETS / key, config.FRAMES_PER_VIDEO)
            images = [crop_face(f) for f in frames] if detector.wants_face_crops else frames
            scores[key] = detector.predict(images)
            level = f"{to_level(scores[key]):6} " if show_level else ""
            print(f"[{n}/{len(keys)}] {scores[key]:.3f} {level}{key}")
        except Exception as err:  # 영상 하나가 실패해도 나머지는 계속
            print(f"[{n}/{len(keys)}] 실패 {key}: {err}", file=sys.stderr)
    print(f"{len(scores)}개 분석, {time.time() - start:.0f}초")
    return scores


def calibrate(levels: dict, scores: dict[str, float]) -> None:
    """손으로 분류한 영상의 점수를 보고, 같은 비율이 나오는 기준값을 추천한다."""
    manual = {k: v["difficulty"] for k, v in levels.items()
              if k in scores and "source" not in v and "difficulty" in v}
    if not manual:
        print("비교할 손 분류 영상이 없습니다.")
        return
    for lvl in ("easy", "medium", "hard"):
        s = [scores[k] for k, v in manual.items() if v == lvl]
        if s:
            print(f"손 분류 {lvl:6}: {len(s):3}개, 모델 점수 평균 {np.mean(s):.3f} (중앙값 {np.median(s):.3f})")
    ordered = sorted(scores[k] for k in manual)
    counts = {lvl: list(manual.values()).count(lvl) for lvl in ("easy", "medium", "hard")}
    medium_min = ordered[counts["hard"]] if counts["hard"] < len(ordered) else 1.0
    easy_min = ordered[counts["hard"] + counts["medium"]] if counts["hard"] + counts["medium"] < len(ordered) else 1.0
    agree = sum(
        ("easy" if scores[k] >= easy_min else "medium" if scores[k] >= medium_min else "hard") == v
        for k, v in manual.items())
    print(f"\n추천 기준값 (손 분류와 같은 비율): EASY_MIN = {easy_min:.3f}, MEDIUM_MIN = {medium_min:.3f}")
    print(f"이 기준으로 손 분류와 일치: {agree}/{len(manual)} ({agree / len(manual):.0%})")
    print("config.py의 값을 바꾸려면 직접 고쳐 주세요.")


def write_levels(levels: dict) -> None:
    LEVELS_JSON.write_text(json.dumps(dict(sorted(levels.items())), ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print(f"{LEVELS_JSON.relative_to(ROOT)}에 기록했습니다.")


def classify_real(levels: dict, args: argparse.Namespace) -> None:
    """REAL 영상은 '가짜 확률'이 높을수록 어렵다 (AI도 가짜로 착각한 진짜).
    기준값을 맞출 손 분류가 없으므로 점수 순으로 3등분한다. 자동 분류 항목은 매번 다시 매긴다."""
    keys = [k for k in list_videos(config.REAL_DIRS)
            if k not in levels or levels[k].get("source") == "auto"]
    if args.limit:
        keys = keys[:args.limit]
    if not keys:
        print("분류할 REAL 영상이 없습니다.")
        return
    scores = score_videos(keys, show_level=False)
    ordered = sorted(scores, key=scores.get)  # 낮은 점수(진짜다움)부터
    third = len(ordered) / 3
    for rank, key in enumerate(ordered):
        lvl = "easy" if rank < third else "medium" if rank < 2 * third else "hard"
        levels[key] = {"difficulty": lvl, "source": "auto",
                       "score": round(scores[key], 4), "model": config.DETECTOR.name}
    print(f"결과: 쉬움·보통·어려움 각 약 {len(ordered) // 3}개")
    if args.dry_run:
        print("(--dry-run이라 파일은 바꾸지 않았습니다)")
        return
    write_levels(levels)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rescore-auto", action="store_true", help="자동 분류했던 영상도 다시 분류")
    parser.add_argument("--dry-run", action="store_true", help="파일을 바꾸지 않고 결과만 출력")
    parser.add_argument("--calibrate", action="store_true", help="손 분류 영상과 비교해 기준값 추천 (파일은 안 바뀜)")
    parser.add_argument("--real", action="store_true", help="REAL 영상 난이도 분류 (점수 순 3등분)")
    parser.add_argument("--limit", type=int, help="앞에서부터 N개만 처리 (시험용)")
    args = parser.parse_args()

    levels = json.loads(LEVELS_JSON.read_text(encoding="utf-8")) if LEVELS_JSON.exists() else {}
    if args.real:
        classify_real(levels, args)
        return

    keys = list_videos(config.FAKE_DIRS)

    if args.calibrate:
        targets = [k for k in keys if k in levels and "source" not in levels[k] and "difficulty" in levels[k]]
    else:
        targets = [k for k in keys
                   if k not in levels or (args.rescore_auto and levels[k].get("source") == "auto")]
    if args.limit:
        targets = targets[:args.limit]
    if not targets:
        print("분류할 영상이 없습니다. (손 분류 항목은 건드리지 않습니다. 모델을 바꿨다면 --rescore-auto)")
        return

    scores = score_videos(targets)
    if args.calibrate:
        calibrate(levels, scores)
        return

    for key, score in scores.items():
        levels[key] = {"difficulty": to_level(score), "source": "auto",
                       "score": round(score, 4), "model": config.DETECTOR.name}
    summary = {lvl: sum(to_level(s) == lvl for s in scores.values()) for lvl in ("easy", "medium", "hard")}
    print(f"결과: 쉬움 {summary['easy']} · 보통 {summary['medium']} · 어려움 {summary['hard']}")
    if args.dry_run:
        print("(--dry-run이라 파일은 바꾸지 않았습니다)")
        return
    write_levels(levels)


if __name__ == "__main__":
    main()
