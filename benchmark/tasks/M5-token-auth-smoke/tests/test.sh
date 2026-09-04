#!/bin/bash
# Harbor verifier: runs judge.mjs (the last line emits a 0-100 score JSON), normalized to a 0~1 reward.
# The judge itself always exits 0; when no JSON can be parsed, treat it as 0 points (error-tolerant principle).
# Besides reward.txt/reward.json (Harbor conventions), the full judge result (score + checkpoints + reasons) is
# written to grading.json so every awarded point is traceable to a declared checkpoint.
mkdir -p /logs/verifier
node /tests/judge.mjs > /tmp/judge.out 2>&1
cat /tmp/judge.out
node -e '
const fs = require("node:fs");
const lines = fs.readFileSync("/tmp/judge.out", "utf8").trim().split("\n").filter(Boolean);
let score = 0;
let result = { score: 0, max: 100, reasons: [] };
for (let i = lines.length - 1; i >= 0; i -= 1) {
  try {
    const j = JSON.parse(lines[i]);
    if (typeof j.score === "number" && typeof j.max === "number") { score = j.score; result = j; break }
  } catch {}
}
const reward = Math.max(0, Math.min(1, score / 100));
fs.writeFileSync("/logs/verifier/reward.txt", String(reward) + "\n");
fs.writeFileSync("/logs/verifier/reward.json", JSON.stringify({ reward }) + "\n");
fs.writeFileSync("/logs/verifier/grading.json", JSON.stringify(result, null, 2) + "\n");
console.log("reward: " + reward);
'
