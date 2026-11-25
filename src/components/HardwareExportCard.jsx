/** Download a generated HDL, testbench, waveform or binary layout file.
 * @param {string} file
 * @param {BlobPart} data
 * @returns {void}
 */
export function download(file, data) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(
    new Blob([data], {
      type: typeof data === 'string' ? 'text/plain' : 'application/octet-stream',
    }),
  );
  link.href = url;
  link.download = file;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
