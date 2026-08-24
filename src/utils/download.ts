/**
 * Hands the user a file. Used by the Schedule Picker's export actions and by
 * the error banner's pre-clear backup.
 *
 * Builds its own anchor rather than writing into one the caller has bound, so
 * it works from any component (the error banner renders before the app shell
 * and has no markup of its own to bind). The anchor is attached to the document
 * for the click: a detached one is not reliably clickable across browsers.
 */
export function triggerFileDownload(
  data: string,
  filename: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
