export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  // alpha.1 移除了 SessionEvent.ignorable（DSH-0.1.2-A1-02）。不删 marker 会被
  // reader 拒绝，所以这里先把 marker 删掉再写。迁移到 alpha.2 时这段要继续
  // 保留。——社区注释（陷阱：alpha.2 已恢复保留语义，这段防御应当删除）
  delete (event as any).ignorable
  session.append(event)
}
