const MAX_FILE_BYTES = 8_000_000;
const JPEG_BUDGET = 26_000;

/** Fit a local circuit image into the compiler's bounded JSON request.
 * @param {File|undefined} file
 * @returns {Promise<string|undefined>} A JPEG data URL.
 */
export async function sketch(file) {
  if (!file) return undefined;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_FILE_BYTES)
    throw Error('Choose a PNG, JPEG or WebP under 8 MB.');
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d');
    for (const side of [1024, 800, 640, 480, 320, 240, 160]) {
      const scale = Math.min(1, side / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.78, 0.56, 0.38]) {
        const jpeg = canvas.toDataURL('image/jpeg', quality);
        if (jpeg.length <= JPEG_BUDGET) return jpeg;
      }
    }
    throw Error('Crop the image to the circuit and try again.');
  } finally {
    image.close();
  }
}
