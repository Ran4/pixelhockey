#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx",
#     "pillow",
# ]
# ///
"""Generate pixel-art hockey sprites via OpenAI image generation."""

import base64
import os
import sys
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image

ROOT = Path(__file__).parent.parent
SPRITES_DIR = ROOT / "sprites"
SPRITES_DIR.mkdir(exist_ok=True)

# Load .env
env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

API_KEY = os.environ.get("OPENAI_API_KEY")
if not API_KEY:
    print("OPENAI_API_KEY not found", file=sys.stderr)
    sys.exit(1)

SPRITE_SIZE = 64
SIZE_STR = f"{SPRITE_SIZE}x{SPRITE_SIZE}"

BASE_STYLE = (
    f"Pixel art, exactly {SIZE_STR} pixel grid. SNES 16-bit retro style. "
    "Each pixel is a clearly visible square block. No anti-aliasing, no smoothing. "
    "Top-down bird's-eye view looking straight down."
)
PLAYER_STYLE = f"{BASE_STYLE} Ice hockey game character sprite."
BG_INSTR = "The background must be solid bright magenta (#FF00FF)."

SPRITES = [
    (
        "player_red",
        f"{PLAYER_STYLE} A hockey skater in a bright red jersey with white trim, seen from directly above. "
        "Round red helmet visible, shoulders in red jersey, small hockey stick held to one side. "
        f"Compact character filling about 70% of the image. {BG_INSTR}",
    ),
    (
        "player_blue",
        f"{PLAYER_STYLE} A hockey skater in a bright blue jersey with white trim, seen from directly above. "
        "Round blue helmet visible, shoulders in blue jersey, small hockey stick held to one side. "
        f"Compact character filling about 70% of the image. {BG_INSTR}",
    ),
    (
        "goalie_red",
        f"{PLAYER_STYLE} A hockey goalie in a bright red jersey with goalie pads, seen from directly above. "
        "Larger goalie mask/helmet, wider body due to leg pads and chest protector. Goalie stick (wider blade). "
        f"Bulkier than a regular skater. Red team colors. Compact. {BG_INSTR}",
    ),
    (
        "goalie_blue",
        f"{PLAYER_STYLE} A hockey goalie in a bright blue jersey with goalie pads, seen from directly above. "
        "Larger goalie mask/helmet, wider body due to leg pads and chest protector. Goalie stick (wider blade). "
        f"Bulkier than a regular skater. Blue team colors. Compact. {BG_INSTR}",
    ),
    (
        "puck",
        f"{BASE_STYLE} A black rubber hockey puck, centered on the image. Simple black disc with a subtle "
        f"white highlight/shine on the upper left. Small, about 40% of image size. {BG_INSTR}",
    ),
]


def chroma_key(img: Image.Image, tolerance: int = 40) -> Image.Image:
    """Replace background color (sampled from corner) with transparency."""
    img = img.convert("RGBA")
    pixels = img.load()
    bg_r, bg_g, bg_b = pixels[0, 0][:3]
    thresh = tolerance * tolerance * 3
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            dr, dg, db = r - bg_r, g - bg_g, b - bg_b
            if dr * dr + dg * dg + db * db < thresh:
                pixels[x, y] = (0, 0, 0, 0)
    return img


def generate(name: str, prompt: str) -> bool:
    out_path = SPRITES_DIR / f"{name}.png"
    if out_path.exists():
        print(f"  Skipping {name}.png (exists)")
        return True

    print(f"  Generating {name}.png ...")
    try:
        resp = httpx.post(
            "https://api.openai.com/v1/images/generations",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-image-1",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
                "quality": "high",
            },
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        img_data = data["data"][0]
        if "b64_json" in img_data:
            buf = base64.b64decode(img_data["b64_json"])
        elif "url" in img_data:
            img_resp = httpx.get(img_data["url"], timeout=60)
            buf = img_resp.content
        else:
            print(f"  ✗ {name}: no image in response")
            return False

        img = Image.open(BytesIO(buf))
        img = chroma_key(img)
        img = img.resize((SPRITE_SIZE, SPRITE_SIZE), Image.NEAREST)
        img.save(out_path, "PNG")
        print(f"  ✓ {name}.png ({SIZE_STR})")
        return True

    except Exception as e:
        print(f"  ✗ {name}: {e}")
        return False


def main():
    print(f"Generating {len(SPRITES)} sprites into {SPRITES_DIR}\n")
    ok = fail = 0
    for name, prompt in SPRITES:
        if generate(name, prompt):
            ok += 1
        else:
            fail += 1
    print(f"\nDone: {ok} ok, {fail} failed")


if __name__ == "__main__":
    main()
