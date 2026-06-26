#!/usr/bin/env python3
"""
Process the user-provided raw app icon and generate all Android icon sizes.

CRITICAL DESIGN DECISION (per user feedback):
  The white background is NOT removed from the artwork. It is used only as
  a mask to FIND THE BOUNDING BOX of the icon. The artwork is then cropped
  to that bounding box — exactly as it appears in the source image, with
  all its original pixels (white included) — and resized into the various
  Android icon sizes.

CONTOUR REMOVAL (per latest user feedback):
  The white border/contour around the artwork (the rectangular padding
  between the artwork's actual edge and the bounding box) is removed by
  making border-connected background pixels TRANSPARENT. This uses a
  flood-fill from the image edges — only background pixels that are
  connected (through other background pixels) to the image border are
  made transparent. White pixels DEEP INSIDE the artwork (e.g. white text,
  highlights) are preserved because they are enclosed by non-background
  pixels and not connected to the border.

Pipeline:
  1. Load raw image, convert to RGBA.
  2. Sample the 4 corners to determine the background color (typically
     white or near-white).
  3. Build a binary mask: True = background, False = artwork.
  4. Invert it to get the artwork mask, find its bounding box.
  5. Crop the ORIGINAL image to that bounding box (minimal 2% padding).
  6. Make border-connected background pixels TRANSPARENT via flood fill.
  7. Make the cropped artwork square (pad with TRANSPARENT pixels on
     the shorter sides so the artwork stays centered).
  8. Resize to all required Android sizes.
  9. For round icons: apply a circular alpha mask.
  10. For adaptive foreground: paste the square artwork at 66% scale on
      a transparent canvas (Android safe-zone requirement).

Outputs:
  Without --android:
    Materials/icons/
      box2048-icon-512.png
      box2048-icon-192.png
      box2048-icon-96.png
      box2048-icon-48.png
      box2048-icon-round-512.png

  With --android (also writes):
    android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher.png
    android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher_round.png
    android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher_foreground.png
    android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
    android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
    android/app/src/main/res/values/ic_launcher_background.xml
    android/app/src/main/playstore-icon.png
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageChops
except ImportError:
    print("ERROR: pip install pillow", file=sys.stderr)
    sys.exit(1)

try:
    import numpy as np
    from scipy import ndimage
except ImportError:
    print("ERROR: pip install numpy scipy", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_ICON = PROJECT_ROOT / "Materials" / "icon_raw.png"
OUTPUT_DIR = PROJECT_ROOT / "Materials" / "icons"
ANDROID_RES = PROJECT_ROOT / "android" / "app" / "src" / "main" / "res"

# Tolerance for background detection. The corner color is sampled and any
# pixel within this Manhattan distance is considered background.
# 60 is a good default for slightly off-white backgrounds; bump up if your
# background has gradients.
BG_TOLERANCE = 60

# Padding (in % of the cropped artwork's smaller dimension) added around the
# artwork. Kept small (2%) — just enough to avoid clipping anti-aliased edges.
# The old 8% padding was the source of the "white contour" — it added a thick
# white border around the artwork. Now the padding is transparent (see
# make_square_transparent) and the background is removed via flood fill.
ARTWORK_PADDING_PCT = 0.02  # 2%

# The adaptive icon background color — the area behind the foreground artwork
# on Android 8+ adaptive icons. Set to the game's dark navy so it blends
# with the app's overall visual identity. The old value was the sampled
# background color (white), which created a white square behind the icon.
ADAPTIVE_BG_COLOR_HEX = "#1a1a2e"

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
    samples: list[tuple[int, int, int]] = []
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        # Sample a 5x5 area at each corner for robustness.
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
      255 = background
        0 = foreground (the artwork)
    The mask is used ONLY to find the bounding box — the artwork's original
    pixels are preserved when cropping.
    """
    r, g, b = img.convert("RGB").split()
    r_mask = r.point(lambda v: 255 if abs(v - bg_color[0]) <= tolerance else 0)
    g_mask = g.point(lambda v: 255 if abs(v - bg_color[1]) <= tolerance else 0)
    b_mask = b.point(lambda v: 255 if abs(v - bg_color[2]) <= tolerance else 0)
    # A pixel is background only if ALL three channels are within tolerance.
    combined = ImageChops.multiply(ImageChops.multiply(r_mask, g_mask), b_mask)
    # Median filter cleans up speckles.
    combined = combined.filter(ImageFilter.MedianFilter(3))
    return combined


def make_background_transparent(
    img: Image.Image,
    bg_color: tuple[int, int, int],
    tolerance: int,
) -> Image.Image:
    """
    Make border-connected background pixels transparent.

    Uses a flood-fill approach: only background-colored pixels that are
    connected (through other background pixels) to the image border are
    made transparent. White pixels DEEP INSIDE the artwork (e.g. white text,
    highlights) are preserved because they are enclosed by non-background
    pixels and not connected to the border.

    This is the "magic wand" tool from image editors — select background by
    clicking on the border, and only the connected region is removed.

    Algorithm:
      1. Build a boolean mask: True = background (within color tolerance).
      2. Use scipy.ndimage.label to find connected components in the mask.
      3. Identify which components touch the image border (any of the 4 edges).
      4. Set alpha=0 for pixels in border-connected components.
      5. Keep ALL other pixels (artwork + enclosed white) unchanged.
    """
    arr = np.array(img.convert("RGBA"))
    rgb = arr[:, :, :3].astype(int)

    # Step 1: boolean mask — True where pixel is "background" color.
    bg_mask = np.all(np.abs(rgb - bg_color) <= tolerance, axis=2)

    # Step 2: label connected components (8-connectivity for diagonal).
    structure = np.ones((3, 3), dtype=int)  # 8-connectivity
    labeled, num_labels = ndimage.label(bg_mask, structure=structure)

    if num_labels == 0:
        return img  # No background at all — nothing to do.

    # Step 3: find labels that touch the image border.
    border_labels = set()
    border_labels.update(labeled[0, :].tolist())        # top row
    border_labels.update(labeled[-1, :].tolist())       # bottom row
    border_labels.update(labeled[:, 0].tolist())        # left column
    border_labels.update(labeled[:, -1].tolist())       # right column
    border_labels.discard(0)  # 0 = non-background (artwork)

    # Step 4: set alpha=0 for pixels in border-connected components.
    border_bg = np.isin(labeled, list(border_labels))
    arr[border_bg, 3] = 0  # Set alpha = 0

    result = Image.fromarray(arr)
    bg_pixel_count = int(border_bg.sum())
    print(f"  made {bg_pixel_count} border-connected background pixels transparent")
    print(f"  preserved {int(bg_mask.sum() - bg_pixel_count)} interior background pixels")
    return result


def find_artwork_bbox(mask: Image.Image) -> tuple[int, int, int, int]:
    """
    Given a mask where 255=background and 0=artwork, find the bounding box
    of the artwork (the 0-valued region).
    """
    # Invert: we want a mask where 255 = artwork.
    fg = mask.point(lambda v: 255 - v)
    bbox = fg.getbbox()
    if bbox is None:
        print(
            "ERROR: could not detect artwork — image might be all-background.",
            file=sys.stderr,
        )
        sys.exit(1)
    return bbox


def crop_with_padding(
    img: Image.Image,
    bbox: tuple[int, int, int, int],
    padding_pct: float,
) -> Image.Image:
    """
    Crop the ORIGINAL image to bbox + padding (clamped to image bounds).
    """
    left, top, right, bottom = bbox
    w = right - left
    h = bottom - top
    pad = int(min(w, h) * padding_pct)
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(img.size[0], right + pad)
    bottom = min(img.size[1], bottom + pad)
    return img.crop((left, top, right, bottom))


def make_square_transparent(img: Image.Image) -> Image.Image:
    """
    Pad the image (centered) to a square with TRANSPARENT pixels on the
    shorter sides. This replaces the old make_square_with_background which
    filled with the white background color — the source of the white contour.
    """
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def make_round(img: Image.Image) -> Image.Image:
    """Apply a circular alpha mask to a square image."""
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    mask = mask.filter(ImageFilter.SMOOTH)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask)
    return result


def make_adaptive_foreground(img: Image.Image, target_size: int) -> Image.Image:
    """
    Place the artwork at 66% scale in the center of a transparent
    target_size x target_size canvas. This leaves an 18% margin on each
    side so Android's adaptive icon mask doesn't clip the artwork.

    NOTE: the artwork itself is kept as-is (with its background). The
    adaptive icon background (declared separately in XML as a solid color)
    will fill the visible area behind the foreground.
    """
    visible = int(target_size * 0.66)
    scaled = img.resize((visible, visible), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    canvas.paste(
        scaled,
        ((target_size - visible) // 2, (target_size - visible) // 2),
        scaled,
    )
    return canvas


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
def save_png(img: Image.Image, path: Path, label: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    try:
        display = path.relative_to(PROJECT_ROOT)
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

    print("\nDetecting background color (used ONLY to find the artwork edge):")
    bg = detect_background_color(raw)
    print(f"  sampled background RGB: {bg}")

    print("\nBuilding background mask (to locate artwork bounding box):")
    mask = make_background_mask(raw, bg, BG_TOLERANCE)

    print("\nFinding artwork bounding box:")
    bbox = find_artwork_bbox(mask)
    print(f"  artwork bbox: {bbox}  ({bbox[2]-bbox[0]}x{bbox[3]-bbox[1]})")

    print("\nCropping ORIGINAL image to bbox + 2% padding:")
    cropped = crop_with_padding(raw, bbox, ARTWORK_PADDING_PCT)
    print(f"  cropped size: {cropped.size[0]}x{cropped.size[1]}")

    print("\nRemoving white contour (flood-fill from edges → transparent):")
    transparent_bg = make_background_transparent(cropped, bg, BG_TOLERANCE)

    print("\nMaking square (padding shorter sides with TRANSPARENT pixels):")
    artwork_square = make_square_transparent(transparent_bg)
    print(f"  square size: {artwork_square.size[0]}x{artwork_square.size[1]}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nGenerating preview PNGs to {OUTPUT_DIR.relative_to(PROJECT_ROOT)}/:")
    for size in (512, 192, 96, 48):
        scaled = artwork_square.resize((size, size), Image.LANCZOS)
        save_png(scaled, OUTPUT_DIR / f"box2048-icon-{size}.png", f"{size}px")
    # Round preview at 512.
    round_512 = make_round(artwork_square).resize((512, 512), Image.LANCZOS)
    save_png(round_512, OUTPUT_DIR / "box2048-icon-round-512.png", "round 512")

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
            legacy = artwork_square.resize((size, size), Image.LANCZOS)
            save_png(legacy, out_dir / "ic_launcher.png", f"{density} legacy")
            round_icon = make_round(legacy)
            save_png(round_icon, out_dir / "ic_launcher_round.png", f"{density} round")

        print("\nGenerating adaptive icon foregrounds:")
        for density, size in ADAPTIVE_SIZES.items():
            out_dir = ANDROID_RES / f"mipmap-{density}"
            fg = make_adaptive_foreground(artwork_square, size)
            save_png(fg, out_dir / "ic_launcher_foreground.png", f"{density} foreground")

        print("\nWriting adaptive icon XML + color resource:")
        # Use the game's dark navy as the adaptive icon background — this is
        # the color that shows behind the 66% foreground artwork on Android
        # 8+ adaptive icons. The old value was the sampled background color
        # (white), which created a white square behind the icon. With the
        # contour now transparent, the dark navy shows through and matches
        # the app's visual identity.
        write_color_xml(
            ANDROID_RES / "values" / "ic_launcher_background.xml",
            ADAPTIVE_BG_COLOR_HEX,
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
        playstore = artwork_square.resize((PLAYSTORE_SIZE, PLAYSTORE_SIZE), Image.LANCZOS)
        save_png(playstore, ANDROID_RES.parent / "playstore-icon.png", "playstore")

    print("\nDone.")
    if not args.android:
        print(f"Preview PNGs are in {OUTPUT_DIR.relative_to(PROJECT_ROOT)}/.")
        print("To install into the Android project, re-run: python3 scripts/process_icon.py --android")


if __name__ == "__main__":
    main()
