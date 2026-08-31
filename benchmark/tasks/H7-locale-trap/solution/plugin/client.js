// Browser half: anchors the host session-header by its stable data-slot and
// asserts the injection actually rendered, so a silently missing anchor becomes
// an observable failure instead of a vanishing badge.
export function apply(ctx) {
  const anchor = document.querySelector('[data-slot="conversation.session.header.utilities"]')
  if (!anchor) throw new Error('[bench-locale] anchor slot not found')
  const badge = document.createElement('span')
  badge.textContent = 'loc'
  anchor.appendChild(badge)
  if (!anchor.contains(badge)) throw new Error('[bench-locale] injection did not render')
}
