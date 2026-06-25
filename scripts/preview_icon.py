#!/usr/bin/env python3
"""
Generate a preview PNG of the app icon for download/.
Does NOT require the android/ folder — used to preview the icon design.
"""

import sys
from pathlib import Path

try:
    import cairosvg
except ImportError:
    print("ERROR: pip install cairosvg", file=sys.stderr)
    sys.exit(1)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SVG_SOURCE = PROJECT_ROOT / "public" / "assets" / "icon.svg"
DOWNLOAD_DIR = PROJECT_ROOT.parent / "download"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Preview at common sizes so the user can see how it looks at 512, 192, 96.
for size in (512, 192, 96, 48):
    out = DOWNLOAD_DIR / f"box2048-icon-{size}.png"
    cairosvg.svg2png(
        url=str(SVG_SOURCE),
        write_to=str(out),
        output_width=size,
        output_height=size,
    )
    print(f"  wrote {out}")

print("\nDone. Preview PNGs in /home/z/my-project/download/")
