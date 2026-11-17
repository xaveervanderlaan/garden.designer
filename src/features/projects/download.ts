/** Lets the browser save a text file (all local: no network involved). */
export function downloadTextFile(
  fileName: string,
  text: string,
  mimeType = 'application/json',
): void {
  downloadBlob(fileName, new Blob([text], { type: mimeType }))
}

/** Lets the browser save a file (all local: no network involved). */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
