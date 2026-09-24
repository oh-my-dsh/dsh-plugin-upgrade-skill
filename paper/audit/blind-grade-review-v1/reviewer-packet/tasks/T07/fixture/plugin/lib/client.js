import React from 'react'
import { createPortal } from 'react-dom'

const PROFILES = [
  { id: 'web', label: 'Web', engine: 'dsh' },
  { id: 'cli', label: 'CLI', engine: 'dsh' },
]

function ProfilesSection() {
  return React.createElement(
    'div',
    { className: 'profiles-section' },
    React.createElement('h3', null, 'DSH Profiles'),
    PROFILES.map(p => React.createElement('div', { key: p.id }, p.label)),
  )
}

const host = document.createElement('div')
host.id = 'dsh-profiles-root'
document.body.appendChild(host)
createPortal(React.createElement(ProfilesSection), host, 'profiles-root')

export function apply(ctx) {
  ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
    ProfilesSection,
  )
}
