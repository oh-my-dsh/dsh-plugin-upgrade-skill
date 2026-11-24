# Upgrade machine facts (Windows 11, no MSVC)

- The machine has **no Visual Studio / Build Tools installation** (no
  `vswhere.exe`, no VS directory). The owner refuses to install them.
- Node and corepack/pnpm are installed and working; every previous dsh
  upgrade on this machine installed fine.
- The repository already patches native dependencies through pnpm's
  `patchedDependencies` mechanism (see the existing `patches/node-pty@*.patch`
  precedent): a patch can rewrite a package's install script and entry file,
  and `pnpm-workspace.yaml` registers it.

Exam material only, **do not publish**.
