import type { Bindings } from "./domain";

export type MediaVariant = "thumb" | "preview";

const specs: Record<MediaVariant, { width: number; quality: number }> = {
  thumb: { width: 640, quality: 76 },
  preview: { width: 1600, quality: 82 },
};

export function parseMediaVariant(value: unknown): MediaVariant | null {
  return value === "thumb" || value === "preview" ? value : null;
}

export function mediaVariantKey(objectKey: string, variant: MediaVariant) {
  return `${objectKey}.memboux-${variant}-v1.webp`;
}

export function mediaObjectKeys(objectKey: string) {
  return [objectKey, mediaVariantKey(objectKey, "thumb"), mediaVariantKey(objectKey, "preview")];
}

export async function getOrCreateMediaVariant(
  env: Pick<Bindings, "MEDIA" | "IMAGES">,
  objectKey: string,
  variant: MediaVariant,
) {
  const variantKey = mediaVariantKey(objectKey, variant);
  const cached = await env.MEDIA.get(variantKey);
  if (cached) return { object: cached, generated: false };

  const original = await env.MEDIA.get(objectKey);
  if (!original) return null;
  if (original.size > 20_000_000) return { object: original, generated: false };

  const spec = specs[variant];
  const transformation = await env.IMAGES.input(original.body)
    .transform({ width: spec.width, fit: "scale-down" })
    .output({ format: "image/webp", quality: spec.quality, anim: true });
  const bytes = await new Response(transformation.image()).arrayBuffer();
  await env.MEDIA.put(variantKey, bytes, {
    httpMetadata: { contentType: "image/webp", cacheControl: "private, max-age=31536000, immutable" },
  });
  const stored = await env.MEDIA.get(variantKey);
  if (!stored) throw new Error("Generated image variant was not stored");
  return { object: stored, generated: true };
}
