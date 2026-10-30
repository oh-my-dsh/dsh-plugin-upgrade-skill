// The sprite renderer as it shipped (excerpt). Each terminal cell packs two
// vertical pixels into one half-block glyph: foreground = upper pixel,
// background = lower pixel. Sprite is 25 rows x 40 columns of palette chars
// ('.' = transparent).
const fg = (rgb: Rgb): string => `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
const bg = (rgb: Rgb): string => `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
const RESET = '\x1b[0m'

export function renderSpriteRows(frame: WhaleFrame, palette: Record<string, Rgb | undefined>): string[] {
  const sprite = frame.rows
  const rows: string[] = []
  for (let r = 0; r < sprite.length; r += 2) {
    const upper = sprite[r]
    const lower = sprite[r + 1] ?? ''
    let out = ''
    let current = ''
    for (let x = 0; x < upper.length; x++) {
      const up = palette[upper[x]]
      const lo = palette[lower[x]]
      let seq: string
      let ch: string
      if (up !== undefined && lo !== undefined) {
        seq = fg(up) + bg(lo)
        ch = '▀'
      } else if (up !== undefined) {
        seq = fg(up)
        ch = '▀'
      } else if (lo !== undefined) {
        seq = fg(lo)
        ch = '▄'
      } else {
        seq = ''
        ch = ' '
      }
      if (seq !== current) {
        out += seq === '' ? RESET : seq
        current = seq
      }
      out += ch
    }
    let row = out.replace(/[ ]+$/, '')
    if (!row.endsWith(RESET)) row += RESET
    rows.push(row)
  }
  return rows
}
