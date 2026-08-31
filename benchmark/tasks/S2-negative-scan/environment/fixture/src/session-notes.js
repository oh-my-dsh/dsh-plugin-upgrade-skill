// 纯工具函数，不触碰任何宿主耦合面。文件名带 "session" 只是历史命名习惯。
export function formatSessionNote(text) {
  return String(text).trim().replace(/\s+/g, ' ').slice(0, 200)
}

export function chunk(lines, size) {
  const out = []
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size))
  return out
}
