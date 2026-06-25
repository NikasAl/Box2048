#!/usr/bin/env python3
"""
Generate all Android app icon sizes from a single SVG source.

Outputs PNGs in:
  android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/
      ic_launcher.png            (legacy icon)
      ic_launcher_round.png      (round icon)
      ic_launcher_foreground.png (adaptive icon foreground)
  android/app/src/main/res/values/
      ic_launcher_background.xml (adaptive icon background color)
  android/app/src/main/res/mipmap-anydpi-v26/
      ic_launcher.xml            (adaptive icon declaration)
      ic_launcher_round.xml

Also outputs a 512x512 Play Store icon:
  android/app/src/main/playstore-icon.png

Requirements:
  pip install cairosvg pillow
"""

import os
import shutil
import sys
from pathlib import Path

try:
    import cairosvg
except ImportError:
    print(
        "ERROR: cairosvg not installed.\n"
        "  pip install cairosvg pillow",
        file=sys.stderr,
    )
    sys.exit(1)

from PIL import Image  # noqa: E402

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SVG_SOURCE = PROJECT_ROOT / "public" / "assets" / "icon.svg"
ANDROID_RES = PROJECT_ROOT / "android" / "app" / "src" / "main" / "res"

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
BACKGROUND_COLOR_HEX = "#0f0f23"


def render_svg_to_png(svg_path: Path, png_path: Path, size: int) -> None:
    png_path.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(png_path),
        output_width=size,
        output_height=size,
    )
    print(f"  wrote {png_path.relative_to(PROJECT_ROOT)} ({size}x{size})")


def render_foreground(svg_path: Path, png_path: Path, size: int) -> None:
    """
    Render the SVG scaled down into the center of a transparent canvas,
    leaving the outer ~18% margin transparent so Android's adaptive icon
    mask can clip safely. Visible content = inner 66% (Android safe-zone).
    """
    png_path.parent.mkdir(parents=True, exist_ok=True)
    visible_size = int(size * 0.66)
    temp_path = png_path.with_suffix(".tmp.png")
    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(temp_path),
        output_width=visible_size,
        output_height=visible_size,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    foreground = Image.open(temp_path).convert("RGBA")
    offset = ((size - visible_size) // 2, (size - visible_size) // 2)
    canvas.paste(foreground, offset, foreground)
    canvas.save(png_path)
    temp_path.unlink()
    print(f"  wrote {png_path.relative_to(PROJECT_ROOT)} ({size}x{size}, foreground)")


def make_round_icon(src_png: Path, dst_png: Path, size: int) -> None:
    dst_png.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(src_png).convert("RGBA").resize(
        (size, size), Image.LANCZOS
    )
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask)
    result.save(dst_png)
    print(f"  wrote {dst_png.relative_to(PROJECT_ROOT)} (round)")


def write_color_xml(path: Path, color_hex: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        f'    <color name="ic_launcher_background">{color_hex}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    print(f"  wrote {path.relative_to(PROJECT_ROOT)}")


def write_adaptive_icon_xml(path: Path, foreground_ref: str, background_ref: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        f'    <background android:drawable="{background_ref}" />\n'
        f'    <foreground android:drawable="{foreground_ref}" />\n'
        "</adaptive-icon>\n",
        encoding="utf-8",
    )
    print(f"  wrote {path.relative_to(PROJECT_ROOT)}")


def main() -> None:
    if not SVG_SOURCE.exists():
        print(f"ERROR: SVG source not found: {SVG_SOURCE}", file=sys.stderr)
        sys.exit(1)

    if not ANDROID_RES.exists():
        print(
            f"ERROR: Android res folder not found: {ANDROID_RES}\n"
            "Run `npm run cap:add:android` first to create the android/ project.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Generating legacy + round icons:")
    for density, size in LEGACY_SIZES.items():
        out_dir = ANDROID_RES / f"mipmap-{density}"
        legacy_png = out_dir / "ic_launcher.png"
        round_png = out_dir / "ic_launcher_round.png"
        render_svg_to_png(SVG_SOURCE, legacy_png, size)
        make_round_icon(legacy_png, round_png, size)

    print("\nGenerating adaptive icon foregrounds:")
    for density, size in ADAPTIVE_SIZES.items():
        out_dir = ANDROID_RES / f"mipmap-{density}"
        fg_png = out_dir / "ic_launcher_foreground.png"
        render_foreground(SVG_SOURCE, fg_png, size)

    print("\nGenerating adaptive icon background color resource:")
    write_color_xml(
        ANDROID_RES / "values" / "ic_launcher_background.xml",
        BACKGROUND_COLOR_HEX,
    )

    print("\nGenerating adaptive icon XML declarations:")
    write_adaptive_icon_xml(
        ANDROID_RES / "mipmap-anydpi-v26" / "ic_launcher.xml",
        "@mipmap/ic_launcher_foreground",
        "@color/ic_launcher_background",
    )
    write_adaptive_icon_xml(
        ANDROID_RES / "mipmap-anydpi-v26" / "ic_launcher_round.xml",
        "@mipmap/ic_launcher_foreground",
        "@color/ic_launcher_background",
    )

    print("\nGenerating Play Store 512x512 icon:")
    playstore_png = ANDROID_RES.parent / "playstore-icon.png"
    render_svg_to_png(SVG_SOURCE, playstore_png, PLAYSTORE_SIZE)

    download_dir = PROJECT_ROOT.parent / "download"
    download_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(playstore_png, download_dir / "box2048-playstore-icon.png")
    print(f"  copied to {download_dir / 'box2048-playstore-icon.png'}")

    print("\nDone. Rebuild the APK with `npm run android:debug` to see the new icon.")


if __name__ == "__main__":
    main()
