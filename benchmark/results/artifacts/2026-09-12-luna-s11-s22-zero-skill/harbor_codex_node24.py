import shlex
from harbor.agents.installed.codex import Codex

class CodexNode24(Codex):
    async def install(self, environment):
        if await self._installed_codex_satisfies_version(environment):
            return
        await self.ensure_system_dependencies(environment, ("curl", "bash", "nodejs", "npm", "ripgrep"))
        package = "@openai/codex@" + (self._version or "0.153.3")
        await self.exec_as_agent(environment, command="set -euo pipefail; node --version; npm install -g " + shlex.quote(package) + "; codex --version")
