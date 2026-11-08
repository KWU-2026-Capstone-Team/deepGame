"""탐지 모델 점수의 '순위'로 FAKE 영상 난이도를 쉬움·보통·어려움 3등분해 src/data/fakeLevels.json에 기록한다.

  npm run classify-fakes                   # 레벨이 없는 FAKE 영상 + 자동 분류했던 FAKE 영상을 함께 순위 매겨 3등분
  npm run classify-fakes -- --all          # 손 분류 영상까지 전부 순위로 다시 나눔 (FAKE 전체가 균등해짐)
  npm run classify-fakes -- --rescore-auto # 저장된 점수를 쓰지 않고 모델로 다시 채점 (모델을 바꿨을 때)
  npm run classify-fakes -- --dry-run      # 파일은 안 바꾸고 결과만 출력
  npm run classify-fakes -- --calibrate    # 손 분류 영상을 순위로 나눠 보고 손 분류와 얼마나 일치하는지 출력

나누는 방법: 가짜 확률 순으로 줄을 세워 앞에서부터 1/3씩 자른다.
  가짜 확률이 높을수록 쉬움 (AI도 쉽게 잡은 가짜), 낮을수록 어려움 (AI도 속은 가짜)
REAL 영상은 분류하지 않는다 (게임을 시작할 때마다 무작위로 난이도에 같은 개수씩 배정).

손으로 분류한 항목("source"가 없는 항목)은 --all을 줄 때만 바뀐다.
그때도 원래 손 분류는 "manualDifficulty"에 남겨 두고, 바꾸기 전 파일을 백업한다.
"""

import argparse
import io
import json
import shutil
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
LEVELS = ("easy", "medium", "hard")


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


def split_by_rank(scores: dict[str, float]) -> dict[str, str]:
    """점수가 높은 순으로 줄을 세워 앞에서부터 1/3씩 쉬움·보통·어려움으로 나눈다 (개수 차이는 최대 1개)."""
    ordered = sorted(scores, key=lambda k: (-scores[k], k))
    n = len(ordered)
    return {key: LEVELS[rank * 3 // n] for rank, key in enumerate(ordered)}


def get_scores(keys: list[str], levels: dict, rescore: bool) -> dict[str, float]:
    """같은 모델로 매긴 점수가 저장돼 있으면 그대로 쓰고, 없는 영상만 모델로 채점한다."""
    detector = config.DETECTOR
    scores, todo = {}, []
    for key in keys:
        entry = levels.get(key, {})
        if not rescore and "score" in entry and entry.get("model") == detector.name:
            scores[key] = entry["score"]
        else:
            todo.append(key)
    if scores:
        print(f"저장된 점수 재사용: {len(scores)}개 (모델: {detector.name})")
    if not todo:
        return scores

    print(f"모델 불러오는 중: {detector.name}")
    detector.load()
    start = time.time()
    for n, key in enumerate(todo, 1):
        try:
            if detector.reads_video:
                scores[key] = detector.predict_video(DATASETS / key)
            else:
                frames = extract_frames(DATASETS / key, config.FRAMES_PER_VIDEO)
                images = [crop_face(f) for f in frames] if detector.wants_face_crops else frames
                scores[key] = detector.predict(images)
            print(f"[{n}/{len(todo)}] {scores[key]:.3f} {key}")
        except Exception as err:  # 영상 하나가 실패해도 나머지는 계속
            print(f"[{n}/{len(todo)}] 실패 {key}: {err}", file=sys.stderr)
    print(f"{len(todo)}개 채점, {time.time() - start:.0f}초")
    return scores


def manual_label(entry: dict) -> str | None:
    """손으로 분류한 난이도 (--all로 덮어쓴 뒤에도 manualDifficulty에 남아 있다)."""
    if "manualDifficulty" in entry:
        return entry["manualDifficulty"]
    if "source" not in entry:
        return entry.get("difficulty")
    return None


def calibrate(levels: dict, args: argparse.Namespace) -> None:
    """손 분류 영상만 순위로 3등분해 보고, 손 분류와 얼마나 일치하는지 보여 준다. 파일은 바꾸지 않는다."""
    manual = {k: manual_label(levels[k]) for k in list_videos(config.FAKE_DIRS)
              if k in levels and not levels[k].get("exclude") and manual_label(levels[k])}
    if not manual:
        print("비교할 손 분류 영상이 없습니다.")
        return
    keys = list(manual)[:args.limit] if args.limit else list(manual)
    scores = get_scores(keys, levels, args.rescore_auto)
    if not scores:
        return
    ranked = split_by_rank(scores)
    for lvl in LEVELS:
        s = [scores[k] for k in scores if manual[k] == lvl]
        if s:
            print(f"손 분류 {lvl:6}: {len(s):3}개, 모델 점수 평균 {np.mean(s):.3f} (중앙값 {np.median(s):.3f})")
    agree = sum(ranked[k] == manual[k] for k in scores)
    print(f"\n순위 3등분 결과와 손 분류 일치: {agree}/{len(scores)} ({agree / len(scores):.0%})")


def write_levels(levels: dict) -> None:
    LEVELS_JSON.write_text(json.dumps(dict(sorted(levels.items())), ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print(f"{LEVELS_JSON.relative_to(ROOT)}에 기록했습니다.")


def apply_split(levels: dict, dirs: list[str], include_manual: bool, args: argparse.Namespace) -> None:
    pool = []
    for key in list_videos(dirs):
        entry = levels.get(key, {})
        if entry.get("exclude"):
            continue
        is_manual = "difficulty" in entry and entry.get("source") != "auto"
        if is_manual and not include_manual:
            continue
        pool.append(key)
    if args.limit:
        pool = pool[:args.limit]
    if not pool:
        print("분류할 영상이 없습니다. (손 분류 영상까지 다시 나누려면 --all)")
        return

    scores = get_scores(pool, levels, args.rescore_auto)
    if not scores:
        print("채점된 영상이 없습니다.")
        return
    ranked = split_by_rank(scores)
    for key, lvl in ranked.items():
        old = levels.get(key, {})
        entry = {k: v for k, v in old.items() if k in ("note", "manualDifficulty")}
        if "source" not in old and "difficulty" in old:
            entry["manualDifficulty"] = old["difficulty"]
        entry.update({"difficulty": lvl, "source": "auto",
                      "score": round(scores[key], 4), "model": config.DETECTOR.name})
        levels[key] = entry

    counts = {lvl: list(ranked.values()).count(lvl) for lvl in LEVELS}
    print(f"결과 ({len(ranked)}개를 순위로 3등분): 쉬움 {counts['easy']} · 보통 {counts['medium']} · 어려움 {counts['hard']}")
    skipped = sum(1 for k in list_videos(dirs) if k not in ranked and manual_label(levels.get(k, {}))
                  and levels[k].get("source") != "auto")
    if skipped:
        print(f"손 분류 {skipped}개는 그대로 두었습니다. 전체를 균등하게 나누려면 --all")
    if args.dry_run:
        print("(--dry-run이라 파일은 바꾸지 않았습니다)")
        return
    if include_manual and LEVELS_JSON.exists():
        backup = LEVELS_JSON.with_name(f"fakeLevels.backup-{time.strftime('%Y%m%d-%H%M%S')}.json")
        shutil.copy2(LEVELS_JSON, backup)
        print(f"바꾸기 전 파일을 {backup.relative_to(ROOT)}에 백업했습니다.")
    write_levels(levels)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="손 분류 영상까지 전부 순위로 다시 나눔")
    parser.add_argument("--rescore-auto", action="store_true", help="저장된 점수를 쓰지 않고 다시 채점")
    parser.add_argument("--dry-run", action="store_true", help="파일을 바꾸지 않고 결과만 출력")
    parser.add_argument("--calibrate", action="store_true", help="손 분류와 순위 3등분 결과 비교 (파일은 안 바뀜)")
    parser.add_argument("--limit", type=int, help="앞에서부터 N개만 처리 (시험용)")
    args = parser.parse_args()

    levels = json.loads(LEVELS_JSON.read_text(encoding="utf-8")) if LEVELS_JSON.exists() else {}
    if args.calibrate:
        calibrate(levels, args)
    else:
        apply_split(levels, config.FAKE_DIRS, include_manual=args.all, args=args)


if __name__ == "__main__":
    main()
