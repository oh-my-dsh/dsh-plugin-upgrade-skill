#!/bin/bash
mkdir -p /logs/verifier
node /tests/judge.mjs > /tmp/judge.out 2>&1
cat /tmp/judge.out
node -e '
const fs = require("node:fs");
const lines = fs.readFileSync("/tmp/judge.out", "utf8").trim().split("\n").filter(Boolean);
let score = 0;
for (let i = lines.length - 1; i >= 0; i -= 1) {
  try { const value = JSON.parse(lines[i]); if (typeof value.score === "number") { score = value.score; break } } catch {}
}
const reward = Math.max(0, Math.min(1, score / 100));
fs.writeFileSync("/logs/verifier/reward.txt", String(reward) + "\n");
console.log("reward: " + reward);
'
