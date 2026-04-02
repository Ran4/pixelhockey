#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx",
# ]
# ///
"""Generate hockey sound effects via ElevenLabs API."""

import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).parent.parent
SOUNDS_DIR = ROOT / "sounds"
SOUNDS_DIR.mkdir(exist_ok=True)

env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

API_KEY = os.environ.get("ELEVENLABS_API_KEY")
if not API_KEY:
    print("ELEVENLABS_API_KEY not found", file=sys.stderr)
    sys.exit(1)

SOUNDS = [
    ("shot", "Hockey slap shot, hard stick hitting puck, sharp crack on ice rink", 1.0),
    ("pass", "Soft hockey stick puck tap, gentle pass sound on ice", 0.5),
    ("board", "Hockey puck hitting boards, hard thud against wooden barrier wall", 0.8),
    ("goal", "Hockey goal horn, loud arena horn blast, brief crowd cheer", 2.5),
    ("whistle", "Ice hockey referee whistle, sharp short whistle blast", 1.0),
    ("body_check", "Hockey body check impact, two players colliding, heavy thud with equipment", 0.8),
]


def generate(name: str, text: str, duration: float) -> bool:
    out_path = SOUNDS_DIR / f"{name}.mp3"
    if out_path.exists():
        print(f"  Skipping {name}.mp3 (exists)")
        return True

    print(f"  Generating {name}.mp3 ...")
    try:
        resp = httpx.post(
            "https://api.elevenlabs.io/v1/sound-generation",
            headers={"xi-api-key": API_KEY},
            json={
                "text": text,
                "duration_seconds": duration,
                "prompt_influence": 0.3,
            },
            timeout=60,
        )
        resp.raise_for_status()
        out_path.write_bytes(resp.content)
        print(f"  ✓ {name}.mp3 ({len(resp.content)} bytes)")
        return True
    except Exception as e:
        print(f"  ✗ {name}: {e}")
        return False


def main():
    print(f"Generating {len(SOUNDS)} sounds into {SOUNDS_DIR}\n")
    ok = fail = 0
    for name, text, dur in SOUNDS:
        if generate(name, text, dur):
            ok += 1
        else:
            fail += 1
    print(f"\nDone: {ok} ok, {fail} failed")


if __name__ == "__main__":
    main()
