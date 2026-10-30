// Pure utility functions; they touch no host coupling surface. The "session" in the filename is only a historical naming habit.
export function formatSessionNote(text) {
  return String(text).trim().replace(/\s+/g, ' ').slice(0, 200)
}

export function chunk(lines, size) {
  const out = []
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size))
  return out
}
