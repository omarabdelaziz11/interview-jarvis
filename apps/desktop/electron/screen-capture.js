const { desktopCapturer, screen } = require('electron');

/**
 * Capture the primary monitor as a PNG data URL (no UI / pickers).
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
async function capturePrimaryScreenPngDataUrl() {
  const primary = screen.getPrimaryDisplay();
  const scale = primary.scaleFactor || 1;
  const fullWidth = Math.max(1, Math.floor(primary.size.width * scale));
  const fullHeight = Math.max(1, Math.floor(primary.size.height * scale));
  // Cap capture size so vision requests stay reasonably sized
  const maxEdge = 1920;
  const longest = Math.max(fullWidth, fullHeight);
  const factor = longest > maxEdge ? maxEdge / longest : 1;
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

  const png = source.thumbnail.toPNG();
  return {
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    width,
    height,
  };
}

module.exports = { capturePrimaryScreenPngDataUrl };
