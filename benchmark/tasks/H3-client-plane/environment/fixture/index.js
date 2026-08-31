// 宿主半边：浏览器插件同样有宿主挂载行（bundle patch），这里只做生命周期登记。
export function apply(ctx) {
  console.error("[bench-paste] host half apply() 执行")
}
