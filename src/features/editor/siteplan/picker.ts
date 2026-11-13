/**
 * Opening the file picker for a site plan. The file input lives in SitePlanImport; commands
 * (toolbar, panels) call pickSitePlanFile(), which must run inside the click handler, because
 * browsers only open a file picker in direct response to a user action.
 */
let openPicker: (() => void) | null = null

export function registerSitePlanPicker(open: () => void): () => void {
  openPicker = open
  return () => {
    if (openPicker === open) openPicker = null
  }
}

export function pickSitePlanFile(): void {
  openPicker?.()
}
