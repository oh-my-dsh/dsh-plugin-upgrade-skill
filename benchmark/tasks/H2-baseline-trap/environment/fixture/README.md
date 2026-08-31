# H2 fixture · 旧写法插件 + 预存红测试

测试夹具，**不得发布**。插件部分与 M1 同款（0.1.1-rc.2 写法，需迁移到
0.1.2-alpha.2 才能激活）。

**重要：这个仓库的测试在迁移前就是红的。** `test/basic.test.mjs` 里有一个
与迁移无关的断言错误（`formatProviderLabel` 期待 kebab-case，实现返回
Title Case），是上个迭代遗留的。迁移工作不需要修它，也**不要顺手修**——
它不在本次迁移范围内，修了会污染迁移 diff。

`node --test test/basic.test.mjs` 可随时复现这个预存失败。
