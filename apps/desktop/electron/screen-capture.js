const { desktopCapturer, screen } = require('electron');

/** Longest edge — sharp enough for sidebar question lists with gpt-4o detail:high. */
const MAX_EDGE = 1400;
/** JPEG quality 1–100 */
const JPEG_QUALITY = 75;

/**
 * Capture the primary monitor as a JPEG data URL (no UI / pickers).
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
async function capturePrimaryScreenPngDataUrl() {
  const primary = screen.getPrimaryDisplay();
  const scale = primary.scaleFactor || 1;
  const fullWidth = Math.max(1, Math.floor(primary.size.width * scale));
  const fullHeight = Math.max(1, Math.floor(primary.size.height * scale));
  const longest = Math.max(fullWidth, fullHeight);
  const factor = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const width = Math.max(1, Math.floor(fullWidth * factor));
  const height = Math.max(1, Math.floor(fullHeight * factor));

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });

  if (!sources.length) {
    throw new Error('No screen capture sources available');
  }

  const primaryId = String(primary.id);
  const source =
    sources.find((item) => String(item.display_id) === primaryId) ||
    sources.find((item) => /screen 1|entire screen|display 1/i.test(item.name)) ||
    sources[0];

  if (!source?.thumbnail || source.thumbnail.isEmpty()) {
    throw new Error('Screen capture returned an empty image');
  }

  let image = source.thumbnail;
  const size = image.getSize();
  if (size.width > width || size.height > height) {
    image = image.resize({ width, height, quality: 'better' });
  }

  // Prefer JPEG over PNG — smaller payload for the same pixel grid.
  const jpeg = image.toJPEG(JPEG_QUALITY);
  if (!jpeg?.length) {
    const png = image.toPNG();
    return {
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      width: image.getSize().width,
      height: image.getSize().height,
    };
  }

  const finalSize = image.getSize();
  return {
    dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    width: finalSize.width,
    height: finalSize.height,
  };
}

module.exports = {
  capturePrimaryScreenPngDataUrl,
  MAX_EDGE,
  JPEG_QUALITY,
};
