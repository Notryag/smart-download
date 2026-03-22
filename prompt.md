# 每次开发
先读取 AGENTS.md、TASKS.md、docs/ARCHITECTURE.md、docs/AI_CONTEXT.md。

优先完成当前阶段最优先的一个未完成任务，不要机械地按文件顺序扫任务。

要求：
- 小步修改
- 不改无关文件
- 不引入不必要的新依赖
- 核心逻辑优先按 TDD：先写失败测试，再补实现，再运行验证
- renderer 只做 UI，下载逻辑放 main / core / adapter
- 完成后更新 TASKS.md
- 完成一个小任务后默认直接提交 commit，除非我明确说不要提交
- 提交前默认依赖仓库 hook 自动校验，不要靠人工记忆
- 最后总结修改内容

# 新功能
先读取 AGENTS.md、TASKS.md、docs/ARCHITECTURE.md。

不要写代码。

如果我要新增功能，先判断它属于：
- 当前阶段
- 下一阶段
- backlog

然后把该功能拆成 3-5 个任务，并更新 TASKS.md。

# 卡住时
读取当前代码、TASKS.md、docs/ARCHITECTURE.md、docs/decisions/。

告诉我：
1. 当前进度
2. 为什么卡住
3. 下一步最优解

不要改代码
