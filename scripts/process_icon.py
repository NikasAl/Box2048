#!/usr/bin/env python3
"""
Process the user-provided raw app icon and generate all Android icon sizes.

Input:  Materials/icon_raw.png  (any size; white or near-white background;
        the actual icon artwork is anywhere on the canvas)

Output (into download/ for preview):
  box2048-icon-512.png   512x512  (Play Store size, full artwork)
  box2048-icon-192.png   192x192
  box2048-icon-96.png    96x96
  box2048-icon-48.png    48x48
  box2048-icon-round-512.png  (circular masked version)

Output (into android/app/src/main/res/ when --android flag is given):
  mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
    ic_launcher.png            (legacy, square with rounded corners)
    ic_launcher_round.png      (circular)
    ic_launcher_foreground.png (adaptive icon foreground, with safe-zone margin)
  mipmap-anydpi-v26/
    ic_launcher.xml
    ic_launcher_round.xml
  values/ic_launcher_background.xml

Processing pipeline:
  1. Load raw image, convert to RGBA.
  2. Build a mask of "non-background" pixels. Background is detected
     automatically by sampling the 4 corners and treating any pixel
     within a tolerance of the corner color as background.
  3. Crop the image to the bounding box of the mask (plus a small padding
     so the artwork isn't flush against the icon edge).
  4. Make the background transparent using the mask.
  5. Composite onto the icon background color (dark navy) for legacy icons.
  6. For adaptive foreground, place the artwork at 66% scale on a transparent
     108dp canvas (Android safe-zone requirement).
  7. For round icons, apply a circular alpha mask.

Usage:
  python3 scripts/process_icon.py              # preview only (download/)
  python3 scripts/process_icon.py --android    # also write to android/res/
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    print("ERROR: pip install pillow", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_ICON = PROJECT_ROOT / "Materials" / "icon_raw.png"
DOWNLOAD_DIR = PROJECT_ROOT.parent / "download"
ANDROID_RES = PROJECT_ROOT / "android" / "app" / "src" / "main" / "res"

# Icon background color (matches the SVG version's dark navy).
# Used as the base for legacy icons and adaptive icon background.
BG_COLOR = (15, 15, 35, 255)  # #0f0f23

# Tolerance for background detection. The corner color is sampled and any
# pixel within this Manhattan distance is considered background.
# 60 is a good default for slightly off-white backgrounds; bump up if your
# background has gradients.
BG_TOLERANCE = 60

# Padding (in % of the cropped artwork's smaller dimension) added around the
# artwork before pasting onto the icon canvas. Prevents the artwork from
# touching the icon edge.
ARTWORK_PADDING_PCT = 0.06  # 6%

# Android density sizes.
LEGACY_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
ADAPTIVE_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}
PLAYSTORE_SIZE = 512


# ---------------------------------------------------------------------------
# Processing functions
# ---------------------------------------------------------------------------
def load_raw(path: Path) -> Image.Image:
    """Load the raw icon image and convert to RGBA."""
    if not path.exists():
        print(f"ERROR: raw icon not found: {path}", file=sys.stderr)
        sys.exit(1)
    img = Image.open(path).convert("RGBA")
    print(f"  loaded {path.relative_to(PROJECT_ROOT)}  ({img.size[0]}x{img.size[1]})")
    return img


def detect_background_color(img: Image.Image) -> tuple[int, int, int]:
    """Sample the 4 corners and return the average color (RGB)."""
    w, h = img.size
    samples = []
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        # Sample a small 5x5 area at each corner for robustness.
        for dx in range(5):
            for dy in range(5):
                px = img.getpixel((min(w - 1, x + dx), min(h - 1, y + dy)))
                samples.append(px[:3])
    avg_r = sum(s[0] for s in samples) // len(samples)
    avg_g = sum(s[1] for s in samples) // len(samples)
    avg_b = sum(s[2] for s in samples) // len(samples)
    return (avg_r, avg_g, avg_b)


def make_background_mask(img: Image.Image, bg_color: tuple[int, int, int], tolerance: int) -> Image.Image:
    """
    Return an 'L' mode image where:
      255 = background (will become transparent)
        0 = foreground (the artwork)
    """
    from PIL import ImageChops

    # Split off only RGB (drop alpha if present).
    r, g, b = img.convert("RGB").split()
    r_mask = r.point(lambda v: 255 if abs(v - bg_color[0]) <= tolerance else 0)
    g_mask = g.point(lambda v: 255 if abs(v - bg_color[1]) <= tolerance else 0)
    b_mask = b.point(lambda v: 255 if abs(v - bg_color[2]) <= tolerance else 0)
    # A pixel is background only if ALL three channels are within tolerance.
    combined = ImageChops.multiply(ImageChops.multiply(r_mask, g_mask), b_mask)
    # Median filter cleans up speckles (single-pixel misclassifications)
    # without eroding the foreground edges noticeably.
    combined = combined.filter(ImageFilter.MedianFilter(3))
    return combined


def crop_to_artwork(img: Image.Image, mask: Image.Image, padding_pct: float) -> tuple[Image.Image, Image.Image]:
    """
    Crop img and mask to the bounding box of the foreground (mask==0),
    then add padding around it.
    Returns (cropped_img_with_transparent_bg, cropped_mask).
    """
    # Invert mask: we want a mask where 255 = foreground (artwork).
    fg_mask = mask.point(lambda v: 255 - v)
    bbox = fg_mask.getbbox()
    if bbox is None:
        print("ERROR: could not detect artwork — image might be all-background.", file=sys.stderr)
        sys.exit(1)
    print(f"  detected artwork bbox: {bbox}")

    # Add padding.
    left, top, right, bottom = bbox
    w = right - left
    h = bottom - top
    pad = int(min(w, h) * padding_pct)
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(img.size[0], right + pad)
    bottom = min(img.size[1], bottom + pad)

    cropped_img = img.crop((left, top, right, bottom))
    cropped_fg = fg_mask.crop((left, top, right, bottom))

    # Make background transparent: paste img onto transparent canvas using fg_mask.
    transparent = Image.new("RGBA", cropped_img.size, (0, 0, 0, 0))
    transparent.paste(cropped_img, (0, 0), cropped_fg)
    return transparent, cropped_fg


def make_square(img: Image.Image) -> Image.Image:
    """Pad an image to be square (centered) with transparent background."""
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def composite_on_background(foreground: Image.Image, bg_color: tuple[int, int, int, int]) -> Image.Image:
    """Paste foreground onto a solid bg_color canvas."""
    canvas = Image.new("RGBA", foreground.size, bg_color)
    canvas.paste(foreground, (0, 0), foreground)
    return canvas


def make_round(img: Image.Image) -> Image.Image:
    """Apply a circular alpha mask to a square image."""
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    # Slight anti-alias on the edge.
    mask = mask.filter(ImageFilter.SMOOTH)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask)
    return result


def make_adaptive_foreground(img: Image.Image, target_size: int) -> Image.Image:
    """
    Place the artwork at 66% scale in the center of a transparent
    target_size x target_size canvas. This leaves an 18% margin on each
    side so Android's adaptive icon mask doesn't clip the artwork.
    """
    visible = int(target_size * 0.66)
    # Scale the artwork to fit `visible` while keeping aspect ratio.
    # The artwork is already square (we made it square earlier), so a
    # straight resize works.
    scaled = img.resize((visible, visible), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    canvas.paste(scaled, ((target_size - visible) // 2, (target_size - visible) // 2), scaled)
    return canvas


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
def save_png(img: Image.Image, path: Path, label: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    # Try to show a project-relative path, fall back to absolute for paths
    # outside the project (e.g. download/).
    try:
        rel = path.relative_to(PROJECT_ROOT)
        display = rel
    except ValueError:
        display = path.absolute()
    print(f"  wrote {display}  ({img.size[0]}x{img.size[1]}) [{label}]")


def write_color_xml(path: Path, color_hex: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        f'    <color name="ic_launcher_background">{color_hex}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    try:
        display = path.relative_to(PROJECT_ROOT)
    except ValueError:
        display = path.absolute()
    print(f"  wrote {display}")


def write_adaptive_xml(path: Path, fg_ref: str, bg_ref: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        f'    <background android:drawable="{bg_ref}" />\n'
        f'    <foreground android:drawable="{fg_ref}" />\n'
        "</adaptive-icon>\n",
        encoding="utf-8",
    )
    try:
        display = path.relative_to(PROJECT_ROOT)
    except ValueError:
        display = path.absolute()
    print(f"  wrote {display}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Process raw icon → Android icons.")
    parser.add_argument(
        "--android",
        action="store_true",
        help="Also write icons into android/app/src/main/res/. Requires `npm run cap:add:android` first.",
    )
    args = parser.parse_args()

    print("Loading raw icon:")
    raw = load_raw(RAW_ICON)

    print("\nDetecting background color:")
    bg = detect_background_color(raw)
    print(f"  sampled background RGB: {bg}")

    print("\nBuilding background mask:")
    mask = make_background_mask(raw, bg, BG_TOLERANCE)

    print("\nCropping to artwork bounding box (with padding):")
    artwork, _ = crop_to_artwork(raw, mask, ARTWORK_PADDING_PCT)
    print(f"  cropped artwork size: {artwork.size[0]}x{artwork.size[1]}")

    # Make it square (centered on transparent canvas).
    artwork_square = make_square(artwork)

    # Pre-render two flavors we'll reuse:
    #   - on dark navy background (for legacy + round icons)
    #   - transparent (for adaptive foreground)
    on_bg = composite_on_background(artwork_square, BG_COLOR)

    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    print("\nGenerating preview PNGs to download/:")
    for size in (512, 192, 96, 48):
        scaled = on_bg.resize((size, size), Image.LANCZOS)
        save_png(scaled, DOWNLOAD_DIR / f"box2048-icon-{size}.png", f"{size}px")
    # Round preview at 512.
    round_512 = make_round(on_bg).resize((512, 512), Image.LANCZOS)
    save_png(round_512, DOWNLOAD_DIR / "box2048-icon-round-512.png", "round 512")
    # Also save the transparent cutout for the user's reference.
    save_png(
        artwork_square.resize((512, 512), Image.LANCZOS),
        DOWNLOAD_DIR / "box2048-icon-transparent-512.png",
        "transparent cutout",
    )

    if args.android:
        if not ANDROID_RES.exists():
            print(
                f"\nERROR: {ANDROID_RES} does not exist.\n"
                "Run `npm run cap:add:android` first, then re-run with --android.",
                file=sys.stderr,
            )
            sys.exit(1)

        print("\nGenerating legacy + round icons for Android:")
        for density, size in LEGACY_SIZES.items():
            out_dir = ANDROID_RES / f"mipmap-{density}"
            legacy = on_bg.resize((size, size), Image.LANCZOS)
            save_png(legacy, out_dir / "ic_launcher.png", f"{density} legacy")
            round_icon = make_round(legacy)
            save_png(round_icon, out_dir / "ic_launcher_round.png", f"{density} round")

        print("\nGenerating adaptive icon foregrounds:")
        for density, size in ADAPTIVE_SIZES.items():
            out_dir = ANDROID_RES / f"mipmap-{density}"
            fg = make_adaptive_foreground(artwork_square, size)
            save_png(fg, out_dir / "ic_launcher_foreground.png", f"{density} foreground")

        print("\nWriting adaptive icon XML + color resource:")
        write_color_xml(
            ANDROID_RES / "values" / "ic_launcher_background.xml",
            "#0f0f23",
        )
        write_adaptive_xml(
            ANDROID_RES / "mipmap-anydpi-v26" / "ic_launcher.xml",
            "@mipmap/ic_launcher_foreground",
            "@color/ic_launcher_background",
        )
        write_adaptive_xml(
            ANDROID_RES / "mipmap-anydpi-v26" / "ic_launcher_round.xml",
            "@mipmap/ic_launcher_foreground",
            "@color/ic_launcher_background",
        )

        print("\nGenerating Play Store 512x512 icon:")
        playstore = on_bg.resize((PLAYSTORE_SIZE, PLAYSTORE_SIZE), Image.LANCZOS)
        save_png(playstore, ANDROID_RES.parent / "playstore-icon.png", "playstore")
        # Copy to download/ too.
        save_png(playstore, DOWNLOAD_DIR / "box2048-playstore-icon.png", "playstore copy")

    print("\nDone.")
    if not args.android:
        print("Preview PNGs are in /home/z/my-project/download/.")
        print("To install into the Android project, re-run: python3 scripts/process_icon.py --android")


if __name__ == "__main__":
    main()
