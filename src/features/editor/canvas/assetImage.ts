import { getAsset } from '../../../persistence/projects'

/**
 * Loads an image from the assets table; null if it can't be found or decoded. The object URL is
 * revoked once the image has loaded (a decoded image doesn't need it any more).
 */
export async function loadAssetImage(assetId: string): Promise<HTMLImageElement | null> {
  const asset = await getAsset(assetId)
  if (!asset) return null
  const url = URL.createObjectURL(new Blob([asset.data], { type: asset.mimeType }))
  try {
    const image = new window.Image()
    image.src = url
    await image.decode()
    return image
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
