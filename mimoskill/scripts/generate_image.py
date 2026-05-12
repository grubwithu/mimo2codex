#!/usr/bin/env python3
"""
generate_image.py — general (non-pet) image generation.

Thin wrapper over generate_pet.py: same providers (auto / pollinations /
gpt-image-1 / replicate / local-sd), no chibi-pet prompt boilerplate,
plus an optional --style for common looks.

For Codex /hatch pets, keep using generate_pet.py — it has pet-tuned prompt
prefixes and the --bundle (idle/working/done) state machine.

Usage:
    # free, no key
    python3 generate_image.py --prompt "isometric cyberpunk city at dusk" --out out.png

    # styled
    python3 generate_image.py --style pixel-art --prompt "a brave knight" --out k.png

    # best quality (needs PET_OPENAI_API_KEY — same env var as the pet flow)
    python3 generate_image.py --provider gpt-image-1 --prompt "..." --out out.png

    # multiple variants
    python3 generate_image.py --n 4 --prompt "..." --out img.png
    # produces img-1.png, img-2.png, img-3.png, img-4.png

Only depends on the standard library.
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path


# Load generate_pet.py as a module by absolute path (not `import generate_pet`)
# — the skill is invoked from arbitrary cwd, and we don't ship an __init__.py.
_HERE = Path(__file__).resolve().parent
_GP_PATH = _HERE / "generate_pet.py"
_spec = importlib.util.spec_from_file_location("_generate_pet", _GP_PATH)
if _spec is None or _spec.loader is None:
    sys.stderr.write(f"error: cannot load {_GP_PATH}\n")
    sys.exit(2)
_gp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_gp)


# --- style presets ----------------------------------------------------------

STYLES: dict[str, tuple[str, str]] = {
    "plain": ("", ""),
    "pixel-art": (
        "Retro 16-bit pixel art sprite of ",
        ", transparent background, single sprite, nearest-neighbor",
    ),
    "photo": (
        "Photorealistic photograph of ",
        ", natural lighting, sharp focus, shallow depth of field",
    ),
    "3d-render": (
        "Cute 3D render of ",
        ", soft global illumination, octane render",
    ),
    "line-art": (
        "Black ink line art of ",
        ", clean linework, white background, no shading",
    ),
    "watercolor": (
        "Hand-drawn ink and watercolor of ",
        ", loose linework, watercolor wash",
    ),
    "sticker": (
        "Chibi sticker mascot of ",
        ", transparent background, soft cel-shading, single character",
    ),
}


def apply_style(prompt: str, style: str) -> str:
    prefix, suffix = STYLES[style]
    if not prefix and not suffix:
        return prompt
    body = prompt.strip().rstrip(".,;")
    return f"{prefix}{body}{suffix}"


# --- main -------------------------------------------------------------------

def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__.split("\n", 1)[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--prompt", required=True, help="what to draw (used verbatim by default)")
    p.add_argument(
        "--style",
        choices=list(STYLES),
        default="plain",
        help="optional prompt preset (default: plain — no prefix/suffix)",
    )
    p.add_argument(
        "--provider",
        choices=["auto"] + list(_gp.PROVIDERS),
        default="auto",
        help="image gen backend (same as generate_pet.py)",
    )
    p.add_argument("--reference", type=Path, help="reference image (gpt-image-1 only)")
    p.add_argument("--quality", default="medium", choices=["low", "medium", "high", "hd"])
    p.add_argument("--out", type=Path, required=True, help="output path (PNG)")
    p.add_argument("--n", type=int, default=1, help="number of variants to generate")
    p.add_argument("--size", default=None, help="forwarded where supported (e.g. 1024x1024)")
    p.add_argument("--seed", type=int, default=None, help="forwarded where supported")
    args = p.parse_args()

    if args.n < 1:
        sys.stderr.write("error: --n must be >= 1\n")
        sys.exit(2)

    # Resolve auto provider with the same status line generate_pet.py emits.
    if args.provider == "auto":
        chosen = _gp.resolve_auto_provider()
        if chosen == "pollinations":
            sys.stderr.write(
                "[provider] auto -> pollinations (free, no key required).\n"
                "           For higher quality, set PET_OPENAI_API_KEY (real OpenAI key)\n"
                "           and rerun, or pass --provider replicate / local-sd.\n\n"
            )
        else:
            sys.stderr.write(f"[provider] auto -> {chosen}\n\n")
        args.provider = chosen

    final_prompt = apply_style(args.prompt, args.style)
    sys.stderr.write(f"prompt: {final_prompt}\n")

    # --size / --seed: emit a note where the underlying provider doesn't
    # plumb them through. v1 forwards nothing (generate_pet.py hard-codes
    # 1024x1024 / no seed); future versions can extend per-provider.
    if args.size and args.size != "1024x1024":
        sys.stderr.write(
            f"note: --size {args.size} ignored in v1 (providers run at 1024x1024).\n"
        )
    if args.seed is not None:
        sys.stderr.write(
            "note: --seed ignored in v1 (not plumbed through to providers yet).\n"
        )

    def out_path_for(i: int) -> Path:
        if args.n == 1:
            return args.out
        stem = args.out.stem
        suffix = args.out.suffix or ".png"
        return args.out.parent / f"{stem}-{i + 1}{suffix}"

    for i in range(args.n):
        out = out_path_for(i)
        sys.stderr.write(f"generating ({i + 1}/{args.n}) -> {out}\n")
        _gp.generate_one(args.provider, final_prompt, args.reference, args.quality, out)

    sys.stderr.write(f"\n[ok] wrote {args.n} image(s)\n")


if __name__ == "__main__":
    main()
