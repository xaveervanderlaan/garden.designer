// Local oxlint JS plugin: no hard-coded, user-visible text in JSX.
// All UI text must come from the EN/NL locale files via t('...') (see PLAN.md, definition of done).
// (eslint-plugin-i18next relies on ESLint parser internals that oxlint doesn't provide.)

/** Attributes whose values are shown to (or read out for) the user. */
const USER_FACING_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
  'placeholder',
  'title',
])

const hasLetters = (text) => /\p{L}/u.test(text)

const MESSAGE = 'Hard-coded UI text: put it in the locale files and use t(...).'

/** @param {any} node */
function isStaticString(node) {
  if (!node) return false
  if (node.type === 'Literal') return typeof node.value === 'string' && hasLetters(node.value)
  if (node.type === 'TemplateLiteral') {
    return (
      node.expressions.length === 0 && node.quasis.some((q) => hasLetters(q.value.cooked ?? ''))
    )
  }
  return false
}

const noLiteralJsxText = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow hard-coded user-visible text in JSX' },
  },
  create(context) {
    return {
      JSXText(node) {
        if (hasLetters(node.value)) context.report({ node, message: MESSAGE })
      },
      JSXExpressionContainer(node) {
        const parentType = node.parent?.type
        if (
          (parentType === 'JSXElement' || parentType === 'JSXFragment') &&
          isStaticString(node.expression)
        ) {
          context.report({ node, message: MESSAGE })
        }
      },
      JSXAttribute(node) {
        if (node.name?.type !== 'JSXIdentifier' || !USER_FACING_ATTRIBUTES.has(node.name.name))
          return
        const value =
          node.value?.type === 'JSXExpressionContainer' ? node.value.expression : node.value
        if (isStaticString(value)) context.report({ node, message: MESSAGE })
      },
    }
  },
}

export default {
  meta: { name: 'garden-i18n' },
  rules: { 'no-literal-jsx-text': noLiteralJsxText },
}
