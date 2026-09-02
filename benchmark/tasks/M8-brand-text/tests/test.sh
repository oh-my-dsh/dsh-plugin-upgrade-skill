#!/bin/bash
# Harbor verifier: runs judge.mjs (the last line emits a 0-100 score JSON), normalized to a 0~1 reward.
# The judge itself always exits 0; when no JSON can be parsed, treat it as 0 points (error-tolerant principle).
mkdir -p /logs/verifier
node /tests/judge.mjs > /tmp/judge.out 2>&1
cat /tmp/judge.out
node -e '
const fs = require("node:fs");
const lines = fs.readFileSync("/tmp/judge.out", "utf8").trim().split("\n").filter(Boolean);
let score = 0;
for (let i = lines.length - 1; i >= 0; i -= 1) {
  try {
    const j = JSON.parse(lines[i]);
    if (typeof j.score === "number" && typeof j.max === "number") { score = j.score; break }
  } catch {}
}
const reward = Math.max(0, Math.min(1, score / 100));
fs.writeFileSync("/logs/verifier/reward.txt", String(reward) + "\n");
console.log("reward: " + reward);
'
