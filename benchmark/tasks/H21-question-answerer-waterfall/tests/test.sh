#!/bin/bash
# Harbor verifier: run the 0-100 judge and normalize its last JSON line to 0..1.
# The judge itself always exits 0; the reward is derived from its JSON score.
mkdir -p /logs/verifier
node /tests/judge.mjs > /tmp/h21-judge.out 2>&1
cat /tmp/h21-judge.out
node -e '
const fs = require("node:fs");
const lines = fs.readFileSync("/tmp/h21-judge.out", "utf8").trim().split("\n").filter(Boolean);
let score = 0;
for (let i = lines.length - 1; i >= 0; i -= 1) {
  try {
    const result = JSON.parse(lines[i]);
    if (typeof result.score === "number" && result.max === 100) { score = result.score; break; }
  } catch {}
}
const reward = Math.max(0, Math.min(1, score / 100));
fs.writeFileSync("/logs/verifier/reward.txt", String(reward) + "\n");
console.log("reward: " + reward);
'
