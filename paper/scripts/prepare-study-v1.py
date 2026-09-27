#!/usr/bin/env python3
"""Build auditable *candidate* materials without running solvers or certifying QC.

Git-pinned reference blobs and explicitly configured factual supplements enter the packages. Review metadata and
task/grader sources stay outside each arm's material root. Standard library only.
"""
import argparse
import csv
import hashlib
import json
import re
import subprocess
import sys
import zipfile
import importlib.util
import difflib
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / 'paper/study-v1'
GENERATED = STUDY / 'generated'
SKILL = 'skills/plugin-upgrade'
NO_REFS = '- This is a **closed-book** brief: there are no reference materials outside the fixture — do not search `/tmp`, system directories, or the network for them; mark anything you cannot verify as "unconfirmed" instead of guessing;'
ALLOWED_REFS = '- You may read the assigned material package under `/app/materials/` under BENCHMARK-MATERIALS-v1 below; do not search other locations or the network for missing references; mark anything you cannot verify as "unconfirmed" instead of guessing;'
COMMON_ENTRY = '# Supplied materials\n\nThis directory is the assigned read-only material package. Task scope and the common material-access policy take precedence.\n\n'
spec = importlib.util.spec_from_file_location('adapt_materials', STUDY / 'adapt-materials.py')
adapt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapt)


def sha(data):
    if isinstance(data, str):
        data = data.encode()
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def blob(commit, path):
    return git('show', f'{commit}:{path}')


def tree(commit, path):
    return git('rev-parse', f'{commit}:{path}').decode().strip()


def listing(commit, path):
    return git('ls-tree', '-r', '--name-only', commit, path).decode().splitlines()


def normalized_files(files):
    """Reject path traversal and non-byte values; outputs are regular files."""
    for path, content in files.items():
        p = PurePosixPath(path)
        if p.is_absolute() or '..' in p.parts or not isinstance(content, bytes):
            raise ValueError(f'unsafe material path/value: {path}')
    return files


def file_manifest(files):
    return [{'path': p, 'sha256': sha(b), 'bytes': len(b)} for p, b in sorted(files.items())]


def package_hash(files):
    return sha(encoded(file_manifest(files)))


def overlay_prompt(original, access):
    replaced = NO_REFS in original
    if 'no reference materials outside the fixture' in original and not replaced:
        raise ValueError('unrecognized closed-book wording; manual prompt review required')
    text = original.replace(NO_REFS, ALLOWED_REFS)
    # This policy is deliberately identical across A/B/C/D; no condition label.
    return text.rstrip() + '\n\n' + access.rstrip() + '\n', replaced


def outlinks(files):
    missing = []
    for path, content in sorted(files.items()):
        if not path.endswith('.md'):
            continue
        for target in re.findall(r'\]\(([^\s)]+)', content.decode()):
            if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
                continue
            target = target.split('#')[0]
            if not target:
                continue
            parts = list(PurePosixPath(path).parent.parts)
            for part in PurePosixPath(target).parts:
                if part == '..':
                    if parts:
                        parts.pop()
                    else:
                        parts.append('OUTSIDE')
                elif part != '.':
                    parts.append(part)
            resolved = '/'.join(parts)
            if resolved not in files:
                missing.append({'file': path, 'target': target, 'resolved': resolved,
                                'status': 'not-supplied; audit before formal use'})
    return missing


def review_units(entry, refs, commit):
    """Mechanical coverage aids only; exact containment is not semantic review."""
    units = []
    # Paragraphs and table rows are separately reviewable; preserve source lines.
    lines = entry.decode().splitlines()
    start, parts = None, []
    blocks = []
    for i, line in enumerate(lines + [''], 1):
        if not line.strip() or line.startswith('|'):
            if parts:
                blocks.append((start, i - 1, '\n'.join(parts)))
                start, parts = None, []
            if line.startswith('|'):
                blocks.append((i, i, line))
        else:
            if start is None:
                start = i
            parts.append(line)
    for start, end, text in blocks:
        if text in ('---',) or text.startswith('#') or re.fullmatch(r'[| :\-]+', text):
            continue
        exact = [p for p, v in sorted(refs.items()) if text in v.decode()]
        units.append({'id': f'{commit[:12]}-L{start}', 'source': f'{SKILL}/SKILL.md',
                      'startLine': start, 'endLine': end, 'text': text,
                      'exactContainmentCandidates': exact,
                      'toolOrExampleMention': bool(re.search(r'scripts/|examples/', text)),
                      'reviewStatus': 'pending', 'classification': None,
                      'referenceEvidence': [], 'cSupplementNeeded': None,
                      'reviewer': None, 'rationale': None})
    return units


def build_materials(config):
    source = config['sourceCommit']
    inventory_path = config['candidateInventory']
    inv = json.loads(blob(source, inventory_path))
    access = (STUDY / 'material-access.md').read_text()
    exposure = {r['task_id']: r for r in csv.DictReader(
        blob(source, 'paper/audit/task-exposure-ledger.csv').decode().splitlines())}
    tasks, prompts, revisions = [], {}, {source}
    for row in inv['tasks']:
        tid = row['id']
        base = f'benchmark/tasks/{tid}'
        toml = blob(source, f'{base}/task.toml').decode()
        original = blob(source, f'{base}/instruction.md').decode()
        match = re.search(r'^skill_snapshot_commit = "([0-9a-f]{40})"', toml, re.M)
        revision = match[1] if match else source
        revisions.add(revision)
        prompt, changed = overlay_prompt(original, access)
        prompts[tid] = prompt.encode()
        tasks.append({'task': tid, 'interactionMode': row['interactionMode'],
                      'sourceTaskTree': tree(source, base), 'annotationTaskTree': row['treeSha'],
                      'annotationEvidenceDrift': row['treeSha'] != tree(source, base),
                      'fixtureTree': tree(source, f'{base}/environment/fixture'),
                      'graderTree': tree(source, f'{base}/tests'),
                      'taskTomlSha256': sha(toml), 'originalPromptSha256': sha(original),
                      'candidatePromptSha256': sha(prompt), 'closedBookConflictReplaced': changed,
                      'skillSourceCommit': revision, 'materialVariant': revision[:12],
                      'taskVersion': re.search(r'^version = "([^"]+)"', toml, re.M)[1],
                      'exposureRecord': exposure.get(tid), 'admission': 'pending-QC',
                      'independentTestCertified': False})
    generic_source = 'skills/generic-migration/SKILL.md'
    generic = blob(source, generic_source)
    # Full original bytes retained, including source frontmatter; native skills disabled.
    packages, variants, units, edits = {}, [], [], []
    for rev in sorted(revisions):
        refpaths = listing(rev, f'{SKILL}/references')
        if any(not p.endswith(('.md', '.json')) for p in refpaths):
            raise ValueError('unexpected executable/binary in references; explicit audit required')
        refs = {p[len(SKILL) + 1:]: blob(rev, p) for p in refpaths}
        entry = blob(rev, f'{SKILL}/SKILL.md')
        original_refs = dict(refs)
        units.extend(review_units(entry, original_refs, rev))
        refs = {p: adapt.adapt_reference(p, b) for p, b in refs.items()}
        refs = adapt.neutralize_missing_links(refs, outlinks(refs))
        guidance_path = config['adaptedGuidance'][rev[:12]]
        guidance = (STUDY / guidance_path).read_bytes()
        # Unicode-aware exact replacement (the original contains an arrow).
        adapted_generic = generic.decode().replace('**Never migrate blind.** If you have not read the upstream changelog for every\n  version in the corridor (start → target, inclusive), you are guessing.', '**State evidence limits.** Use the supplied corridor evidence. If upstream\n  notes are absent, mark missing facts unconfirmed and continue the permitted inspection.').encode()
        index = '## Reference index\n\n' + ''.join(f'- [{p}]({p})\n' for p in sorted(refs))
        arms = {
            'A': {'ENTRY.md': (COMMON_ENTRY + 'No migration guidance or reference documents are supplied.\n').encode()},
            'B': {'ENTRY.md': (COMMON_ENTRY + 'Guidance: [guidance.md](guidance.md).\n').encode(),
                  'guidance.md': adapted_generic},
            'C': {'ENTRY.md': (COMMON_ENTRY + index).encode(), **refs},
            'D': {'ENTRY.md': (COMMON_ENTRY + 'Guidance: [guidance.md](guidance.md).\n\n' + index).encode(),
                  'guidance.md': guidance, **refs},
        }
        supplement_path = config.get('sharedFactSupplements', {}).get(rev[:12])
        supplement = (STUDY / supplement_path).read_bytes() if supplement_path else None
        if supplement is not None:
            for arm in ('C', 'D'):
                arms[arm]['fact-supplement.md'] = supplement
                arms[arm]['ENTRY.md'] += b'\nAdditional source facts: [fact-supplement.md](fact-supplement.md).\n'
        for arm in arms:
            normalized_files(arms[arm])
        assert {p: b for p, b in arms['C'].items() if p.startswith('references/')} == refs
        assert {p: b for p, b in arms['D'].items() if p.startswith('references/')} == refs
        packages[rev[:12]] = arms
        for path, before, after in [('guidance.md', entry, guidance), ('generic-guidance.md', generic, adapted_generic),
                                    *[(p, original_refs[p], refs[p]) for p in sorted(refs)]]:
            if before != after:
                edits.append({'variant': rev[:12], 'path': path, 'beforeSha256': sha(before), 'afterSha256': sha(after),
                              'diff': ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True), fromfile='pinned/' + path, tofile='adapted/' + path))})
        variants.append({'id': rev[:12], 'sourceCommit': rev,
                         'skillEntrySha256': sha(entry), 'referenceFiles': file_manifest(refs),
                         'sourceReferenceFiles': file_manifest(original_refs),
                         'adaptedGuidance': {'path': guidance_path, 'sha256': sha(guidance), 'status': 'document-only adaptation, not the original full skill'},
                         'sharedFactSupplement': {'sourcePath': supplement_path, 'sha256': sha(supplement),
                             'status': 'single human draft; partial coverage repair'} if supplement is not None else None,
                         'genericSourceCommit': source, 'genericSourcePath': generic_source,
                         'genericSha256': sha(generic), 'factEquivalence': 'adapted-entry review; no independent certification',
                         'referenceIdentity': 'C/D byte-identical',
                         'unavailableLinks': {a: outlinks(f) for a, f in arms.items()},
                         'arms': {a: {'packageSha256': package_hash(f), 'files': file_manifest(f),
                                      'totalBytes': sum(map(len, f.values())), 'tokenCount': None}
                                  for a, f in arms.items()}})
    manifest = {'schemaVersion': 1, 'study': config['id'], 'status': 'candidate-not-frozen',
                'formalRunAllowed': False, 'sourceCommit': source,
                'candidateInventorySha256': sha(blob(source, inventory_path)),
                'configSha256': sha((STUDY / 'config.json').read_bytes()),
                'materialAccessSha256': sha(access), 'tasks': tasks, 'variants': variants,
                'selectionRule': config['selectionRule'],
                'materialEdits': edits,
                'blockers': ['document-only adaptation completed; actual tool/runtime feasibility requires isolated pilot',
                             'task QC and behavioral endpoint separation incomplete',
                             'final model/serving/scaffold and resource limits unset',
                             'repetition/statistical/grouping protocol not frozen',
                             'runner material-mount/network/native-catalog isolation not validated'],
                'excludedFromSolverPackages': ['scripts', 'examples', 'solutions', 'tests',
                                               'historical answers', 'grader packets', 'review metadata']}
    return manifest, packages, prompts, {'status': 'pending-semantic-review',
        'note': 'Not independent annotation; source excerpts only. Do not edit generated output; record decisions separately.',
        'permittedClassifications': ['procedure-only', 'fact-already-in-C', 'fact-missing-in-C',
                                     'tool-dependency', 'mixed', 'metadata'], 'units': units}


def render_manifest_md(manifest):
    lines = ['# 四条件候选材料清单', '', '**状态：候选，未冻结；没有启动 solver。**', '',
             f"来源提交：`{manifest['sourceCommit']}`。保留 {len(manifest['tasks'])} 个候选成员。", '',
             '| 资料版本 | 使用任务 | 引用文件数 | A/B/C/D 字节数 | C/D 事实等价 |', '|---|---|---:|---|---|']
    for v in manifest['variants']:
        tids = [t['task'] for t in manifest['tasks'] if t['materialVariant'] == v['id']]
        scope = '默认（其余 54 题）' if len(tids) == 54 else ', '.join(tids)
        sizes = ' / '.join(str(v['arms'][a]['totalBytes']) for a in 'ABCD')
        lines.append(f"| `{v['id']}` | {scope} | {len(v['referenceFiles'])} | {sizes} | 待审核 |")
    lines += ['', '字节数不是 token。C/D 适配后的 references 与事实补充逐字相同；D 使用去掉版本摘要和缺失 helper 指令的纯文档流程。适配差异记录在 manifest，不能称原版完整 skill。', '',
              '## 仍需审核', ''] + [f'- {b}' for b in manifest['blockers']]
    lines += ['', '## 提示变化', '', '全部候选题附加相同 BENCHMARK-MATERIALS-v1；下列原有闭卷冲突句被替换：', '']
    lines += [f"- `{t['task']}`" for t in manifest['tasks'] if t['closedBookConflictReplaced']]
    lines += ['', '原任务、fixture、grader 未修改。改写后的提示必须用于新跑，不能靠重评旧答案模拟新提示。', '',
              '## 文件边界', '', '每个 arm 根目录才是 solver 材料；总包的 manifest、prompt 索引和 review 文件不得一起挂入 solver。',
              '外链及未供应的 scripts/examples 链接不授予访问权，完整清单在 material-manifest.json 的 unavailableLinks。', '']
    return '\n'.join(lines).encode()


def write_outputs(outputs, check=False):
    stale = [p for p, b in outputs.items() if not p.exists() or p.read_bytes() != b]
    if check and stale:
        raise ValueError('generated outputs missing/drifted: ' + ', '.join(str(p.relative_to(ROOT)) for p in stale))
    if not check:
        for p, b in outputs.items():
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b)


def materialize(destination, manifest, packages, prompts):
    dest = Path(destination).resolve()
    if dest.exists():
        raise ValueError('materialize requires a fresh directory; no existing files will be replaced')
    if dest == ROOT or ROOT in dest.parents:
        raise ValueError('materialize outside the repository (e.g. /tmp); use --archive for a repository deliverable')
    dest.mkdir(parents=True)
    (dest / 'material-manifest.json').write_bytes(encoded(manifest))
    (dest / 'MATERIAL-ACCESS.txt').write_bytes((STUDY / 'material-access.md').read_bytes())
    for variant, arms in packages.items():
        for arm, files in arms.items():
            for p, content in files.items():
                target = dest / 'materials' / variant / arm / p
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
    for tid, content in prompts.items():
        target = dest / 'prompts' / tid / 'instruction.md'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    return dest


def archive(path, manifest, packages, prompts):
    """Deterministic self-contained candidate archive, never a trial dataset."""
    files = {'material-manifest.json': encoded(manifest),
             'MATERIAL-ACCESS.txt': (STUDY / 'material-access.md').read_bytes()}
    for variant, arms in packages.items():
        for arm, contents in arms.items():
            for p, data in contents.items():
                files[f'materials/{variant}/{arm}/{p}'] = data
    for tid, data in prompts.items():
        files[f'prompts/{tid}/instruction.md'] = data
    target = Path(path)
    if target.exists():
        raise ValueError('archive requires a new path; do not overwrite a previously distributed candidate')
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 9, 13, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--materialize')
    parser.add_argument('--archive')
    parser.add_argument('--freeze-check', action='store_true')
    args = parser.parse_args()
    if args.check and (args.materialize or args.archive):
        parser.error('--check is read-only; cannot combine with --materialize/--archive')
    config = json.loads((STUDY / 'config.json').read_text())
    manifest, packages, prompts, review = build_materials(config)
    if args.freeze_check:
        raise ValueError('FORMAL RUN NOT READY:\n- ' + '\n- '.join(manifest['blockers']))
    outputs = {GENERATED / 'material-manifest.json': encoded(manifest),
               GENERATED / 'fact-coverage-review.json': encoded(review),
               GENERATED / 'MATERIALS.zh.md': render_manifest_md(manifest)}
    write_outputs(outputs, args.check)
    if args.materialize:
        print('materialized:', materialize(args.materialize, manifest, packages, prompts))
    if args.archive:
        p = archive(args.archive, manifest, packages, prompts)
        print('archive:', p, 'sha256:', sha(p.read_bytes()))
    print(f"{'checked' if args.check else 'prepared'} {len(manifest['tasks'])} tasks, {len(packages)} variants x 4 arms; document-only adaptation; runtime pilot pending")


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
