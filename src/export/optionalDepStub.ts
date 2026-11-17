/** jsPDF's optional dependencies (html2canvas, dompurify, canvg) are never used: stub them out. */
export default function unavailable(): never {
  throw new Error('This jsPDF feature is not available in this build')
}
