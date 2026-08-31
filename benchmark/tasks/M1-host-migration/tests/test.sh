#!/bin/bash
# Harbor verifier：运行 judge.mjs（末行输出 0-100 分 JSON），归一化为 0~1 reward。
# judge 自身永远 exit 0；解析不到 JSON 时按 0 分处理（错误容忍原则）。
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
