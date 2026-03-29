#!/usr/bin/env python3

import argparse
from pathlib import Path

from PIL import Image


def compress_to_jpeg(input_path: Path, output_path: Path, quality: int):
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(input_path) as image:
        image = image.convert("RGBA")
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        flattened = Image.alpha_composite(background, image).convert("RGB")
        flattened.save(
            output_path,
            format="JPEG",
            quality=quality,
            optimize=True,
            progressive=True,
            subsampling=2,
        )


def main():
    parser = argparse.ArgumentParser(description="Compress an image into JPEG")
    parser.add_argument("--input", required=True, help="Source image path")
    parser.add_argument("--output", required=True, help="Destination jpg path")
    parser.add_argument("--quality", type=int, default=46, help="JPEG quality")
    args = parser.parse_args()

    compress_to_jpeg(Path(args.input), Path(args.output), args.quality)


if __name__ == "__main__":
    main()
