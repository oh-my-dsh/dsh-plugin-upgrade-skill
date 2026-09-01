import { clientBundle } from '../../../shared/tsdown.client.ts'

export default clientBundle(
  '@linxin666/dsh-client-ui-skin-center',
  ['src/index.ts'],
  {
    lib: {
      // 宿主侧会在运行时从 dsh 配置树解析 dsh-settings / schemastery，而非本地安装；
      // 保持外部。
      // lightningcss 是带 native binding 的运行时依赖（CSS 安全管线），
      // 打进 bundle 会丢失 .node 文件路径，必须 external。
      external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-settings', 'schemastery', 'lightningcss'],
    },
  },
)
