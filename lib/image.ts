/**
 * Client-side image downscaling for meal photos. Runs only in the browser (called from
 * user event handlers) — never at module top level, so it's SSR-safe.
 *
 * Downscaling before upload is a large token/bandwidth saver: max edge 1280px, JPEG q0.82.
 * EXIF orientation is honored via createImageBitmap({ imageOrientation: 'from-image' }),
 * with a plain-decode fallback for browsers that lack the option.
 */

export type DownscaleResult = { blob: Blob; width: number; height: number };

export async function downscaleImage(
  file: File,
  maxEdge = 1280,
  quality = 0.82,
): Promise<DownscaleResult> {
  const bitmap = await decode(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, quality);
    return { blob, width, height };
  } finally {
    // Free the decoded bitmap promptly (large photos).
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}

type Decoded = { width: number; height: number; close?: () => void } & CanvasImageSource;

async function decode(file: File): Promise<Decoded> {
  // Preferred path: honors EXIF orientation natively.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return bmp as unknown as Decoded;
    } catch {
      // fall through to the <img> path
    }
  }
  return decodeViaImage(file);
}

function decodeViaImage(file: File): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Modern browsers auto-orient <img>; naturalWidth/Height reflect displayed pixels.
      resolve(
        Object.assign(img, {
          width: img.naturalWidth,
          height: img.naturalHeight,
        }) as unknown as Decoded,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode image."))),
      "image/jpeg",
      quality,
    );
  });
}
