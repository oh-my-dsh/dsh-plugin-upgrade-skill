// main-56 deliberately withholds helper scripts/examples from every solver arm.
// This validates the historical citation against its audit archive; it neither
// repairs the link nor makes the excluded target available to a solver.
import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const contained = (parent, child) => {
  const rel = relative(parent, child)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

export async function isExcludedMaterialLink({root, file, target}) {
  const base = resolve(root, 'benchmark/conditions/main-56')
  const rel = relative(base, resolve(file)).replaceAll(sep, '/')
  const match = /^([CD])\/(references\/[^\n]+\.md)$/.exec(rel)
  // Reject path normalization tricks, even when they land back inside the archive.
  if (!match || !/^\.\.\/(?:scripts|examples|evals)\//.test(target)) return false
  const tail = target.slice(3).replace(/\/$/, '')
  if (tail.split('/').some(part => !part || part === '.' || part === '..') || /[\\?#\0]/.test(tail)) return false
  const archive = join(base, 'audit-only/source/plugin-upgrade')
  const archiveFile = join(archive, match[2])
  const archiveTarget = resolve(dirname(archiveFile), target)
  if (!contained(archive, archiveTarget)) return false
  try {
    const [runtimeBytes, archiveBytes, materials, source, targetStat, actualArchive, actualTarget, actualFile, actualArchiveFile] = await Promise.all([
      readFile(file), readFile(archiveFile),
      readFile(join(base,'material-manifest.json'),'utf8').then(JSON.parse),
      readFile(join(base,'source-manifest.json'),'utf8').then(JSON.parse),
      stat(archiveTarget), realpath(archive), realpath(archiveTarget), realpath(file), realpath(archiveFile),
    ])
    if (!contained(actualArchive, actualTarget) || !contained(actualArchive, actualArchiveFile)) return false
    if (!contained(await realpath(join(base,match[1],'references')),actualFile)) return false
    if (!runtimeBytes.equals(archiveBytes)) return false
    const sha = digest(runtimeBytes)
    const runtimeRecord = materials.conditions?.find(c => c.condition === match[1])?.files?.find(f => f.path === match[2])
    const archivePath = `audit-only/source/plugin-upgrade/${match[2]}`
    const archiveRecord = source.files?.find(f => f.archive_path === archivePath)
    if (runtimeRecord?.sha256 !== sha || archiveRecord?.sha256 !== sha || archiveRecord?.runtime_exposure !== 'C,D') return false
    // The caller passes a parsed link. Confirm it really occurs in the unchanged source.
    const links = [...archiveBytes.toString('utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    if (!links.some(m => m[1].trim().replace(/^<|>$/g,'').split('#',1)[0].split('?',1)[0] === target)) return false
    const targetPath = relative(base,archiveTarget).replaceAll(sep,'/')
    if (targetStat.isDirectory()) {
      const children = source.files.filter(f => f.archive_path.startsWith(`${targetPath}/`))
      return children.length > 0 && children.every(f => f.runtime_exposure === 'excluded-all-arms')
    }
    if (!targetStat.isFile()) return false
    const targetRecord = source.files.find(f => f.archive_path === targetPath)
    return targetRecord?.runtime_exposure === 'excluded-all-arms' && targetRecord.sha256 === digest(await readFile(archiveTarget))
  } catch {
    // An unavailable/malformed archive or manifest cannot exempt a broken link.
    return false
  }
}
