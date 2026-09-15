/**
 * Measure primary-screen capture size without calling OpenAI.
 * Run: npx electron ./electron/measure-screen-capture.js
 */
const { app } = require('electron');
const { capturePrimaryScreenPngDataUrl, MAX_EDGE, JPEG_QUALITY } = require('./screen-capture');

function estimateGpt4oMiniHighTokens(width, height) {
  // OpenAI tile rules (approx): fit 2048, then shortest side <= 768, then 512px tiles
  let w = width;
  let h = height;
  const maxFit = 2048;
  if (Math.max(w, h) > maxFit) {
    const s = maxFit / Math.max(w, h);
    w = Math.floor(w * s);
    h = Math.floor(h * s);
  }
  const shortest = Math.min(w, h);
  if (shortest > 768) {
    const s = 768 / shortest;
    w = Math.floor(w * s);
    h = Math.floor(h * s);
  }
  const tilesX = Math.ceil(w / 512);
  const tilesY = Math.ceil(h / 512);
  const tiles = tilesX * tilesY;
  return {
    resized: { w, h },
    tiles,
    gpt4oMiniHigh: 2833 + tiles * 5667,
    gpt4oHigh: 85 + tiles * 170,
    gpt4oMiniLow: 2833,
    gpt4oLow: 85,
  };
}

app.whenReady().then(async () => {
  try {
    const result = await capturePrimaryScreenPngDataUrl();
    const base64 = result.dataUrl.split(',')[1] || '';
    const bytes = Buffer.from(base64, 'base64').length;
    const mb = bytes / (1024 * 1024);
    const estimate = estimateGpt4oMiniHighTokens(result.width, result.height);

    console.log(JSON.stringify({
      captureSettings: { MAX_EDGE, JPEG_QUALITY },
      pixels: { width: result.width, height: result.height },
      payload: {
        bytes,
        kb: Number((bytes / 1024).toFixed(1)),
        mb: Number(mb.toFixed(3)),
        mime: result.dataUrl.startsWith('data:image/jpeg') ? 'jpeg' : 'png',
      },
      estimatedVisionTokens: estimate,
      note: 'OpenAI bills by detail+tiles, not by MB. gpt-4o-mini + detail=high is ~35k for a full screen.',
    }, null, 2));
  } catch (error) {
    console.error('CAPTURE_FAILED', error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
