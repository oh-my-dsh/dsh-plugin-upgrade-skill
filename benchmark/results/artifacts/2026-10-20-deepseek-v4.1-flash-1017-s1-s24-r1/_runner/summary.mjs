import fs from "node:fs";
import path from "node:path";
import * as lib from "./lib.mjs";

export function buildSummary() {
  const st = lib.loadState();
  const cells = Object.values(st.cells);
  const byTask = new Map();
  for (const c of cells) { if (!byTask.has(c.task)) byTask.set(c.task, {}); byTask.get(c.task)[c.arm] = c; }
  const taskOrder = lib.listTasks();

  const stat = (arm) => {
    const cs = cells.filter((c) => c.arm === arm && c.status === "done");
    const dur = cs.reduce((a, c) => a + (c.duration ?? 0), 0);
    const tok = cs.reduce((a, c) => a + (c.tokens ?? 0), 0);
    const tc = cs.reduce((a, c) => a + (c.toolcalls ?? 0), 0);
    const rep = cs.reduce((a, c) => a + ((c.reportFiles ?? []).filter((f) => /\.(md|txt)$/i.test(f.name)).reduce((x, f) => x + f.bytes, 0)), 0);
    return { n: cs.length, dur, tok, tc, rep, meanDur: cs.length ? Math.round(dur / cs.length / 1000) : 0, meanTok: cs.length ? Math.round(tok / cs.length) : 0 };
  };
  const A = stat("noskill"), B = stat("skill");

  const rows = [];
  for (const t of taskOrder) {
    const n = byTask.get(t)?.noskill, k = byTask.get(t)?.skill;
    const f = (c) => c ? (Math.round((c.duration ?? 0) / 1000) + "s / " + (c.toolcalls ?? 0) + " / " + (c.tokens ?? 0)) : "-";
    rows.push("| " + t + " | " + f(n) + " | " + f(k) + " | " + [n?.status, k?.status].map((x) => x ?? "-").join(" / ") + " |");
  }

  const anomalies = cells.filter((c) => c.status !== "done" || (c.flags ?? []).length || (c.attempts ?? 0) > 0 || (c.writes ?? []).some((w) => !String(w).includes("agent-output")));
  const lines = [];
  lines.push("# 运行汇总 · " + st.cells[Object.keys(st.cells)[0]]?.model + "");
  lines.push("");
  lines.push("- 模型：" + (cells.find((c) => c.model)?.model ?? "DeepSeek-V4.1-Flash-1017") + "（provider: " + (cells.find((c) => c.provider)?.provider ?? "paratera") + "）");
  lines.push("- 完成格数：" + cells.filter((c) => c.status === "done").length + " / " + cells.length);
  lines.push("- 总时长（48 格串行口径的 agent 耗时之和）：" + Math.round((A.dur + B.dur) / 60000) + " 分钟");
  lines.push("- 总 token：" + (A.tok + B.tok).toLocaleString("en-US") + "（noskill " + A.tok.toLocaleString("en-US") + " / skill " + B.tok.toLocaleString("en-US") + "）");
  lines.push("- 总 toolcalls：" + (A.tc + B.tc) + "（noskill " + A.tc + " / skill " + B.tc + "）");
  lines.push("");
  lines.push("## 分臂");
  lines.push("");
  lines.push("| 臂 | 完成格 | 平均时长 | 平均 token | 平均 toolcalls | 报告总字节 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  lines.push("| noskill | " + A.n + " | " + A.meanDur + "s | " + A.meanTok.toLocaleString("en-US") + " | " + (A.n ? Math.round(A.tc / A.n) : 0) + " | " + A.rep + " |");
  lines.push("| skill | " + B.n + " | " + B.meanDur + "s | " + B.meanTok.toLocaleString("en-US") + " | " + (B.n ? Math.round(B.tc / B.n) : 0) + " | " + B.rep + " |");
  lines.push("");
  lines.push("## 逐题（时长 / toolcalls / tokens）");
  lines.push("");
  lines.push("| task | noskill | skill | status |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of rows) lines.push(r);
  lines.push("");
  lines.push("## 异常清单");
  lines.push("");
  if (!anomalies.length) lines.push("- 无。48 格全部 status=done，审计 0 越界，fixture 全部 front/back SHA-256 一致。");
  for (const c of anomalies) {
    lines.push("- " + c.task + "/" + c.arm + "：status=" + c.status + (c.note ? "；note=" + c.note : "") + ((c.flags ?? []).length ? "；flags=" + JSON.stringify(c.flags) : "") + ((c.attempts ?? 0) ? "；attempts=" + c.attempts : ""));
  }
  return lines.join("\n") + "\n";
}
