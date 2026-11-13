/** Joins class names, skipping falsy values: cx(a, isActive && b). */
export function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ')
}
