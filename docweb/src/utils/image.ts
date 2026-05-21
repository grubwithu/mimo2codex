// Image utilities for the AskDrawer attachment flow. We resize and re-encode
// every attached image client-side before shipping so a 4000×3000 phone
// screenshot doesn't turn into a 6 MB base64 payload.

const DEFAULT_MAX_DIM = 1280;
const DEFAULT_JPEG_QUALITY = 0.75;

export interface CompressOptions {
  maxDim?: number;
  quality?: number;
}

// compressImageFile takes any decodable bitmap input (PNG/JPEG/WebP/etc.) and
// returns a JPEG data URL bounded by `maxDim` on its longer side. JPEG is
// chosen for output even when the source is PNG because:
//   - the model doesn't care about transparency for config screenshots
//   - JPEG is typically 3-5× smaller for the same visual fidelity
export async function compressImageFile(
  file: File | Blob,
  opts: CompressOptions = {},
): Promise<string> {
  const maxDim = opts.maxDim ?? DEFAULT_MAX_DIM;
  const quality = opts.quality ?? DEFAULT_JPEG_QUALITY;

  // Prefer createImageBitmap when available — it's an order of magnitude
  // faster than the <img> + onload path for large source images.
  let width = 0;
  let height = 0;
  let bitmap: ImageBitmap | HTMLImageElement | null = null;
  if (typeof createImageBitmap === "function") {
    bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
  } else {
    const url = URL.createObjectURL(file);
    try {
      bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("decode failed"));
        img.src = url;
      });
      width = bitmap.naturalWidth;
      height = bitmap.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const ratio = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * ratio));
  const targetH = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unsupported");
  // Fill white so JPEG flatten of transparent PNG doesn't yield black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH);
  if ("close" in bitmap && typeof bitmap.close === "function") {
    bitmap.close();
  }
  return canvas.toDataURL("image/jpeg", quality);
}

// dataUrlByteSize returns the decoded-bytes size implied by a data URL — used
// to surface the post-compression footprint to the user.
export function dataUrlByteSize(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  if (i < 0) return dataUrl.length;
  const base64 = dataUrl.slice(i + 1);
  // base64 inflates by 4/3; strip padding before estimating.
  const pad = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor((base64.length * 3) / 4) - pad;
}
