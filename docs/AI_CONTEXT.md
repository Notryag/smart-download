# AI Context

## Read Order

每次接手前，按这个顺序读：

1. `AGENTS.md`
2. `TASKS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/decisions/`
5. 相关代码文件

如果这些文件之间有冲突，以 `AGENTS.md` 和 `TASKS.md` 为准。

## Current Reality

接手时默认成立的事实：

- 当前阶段只支持 `magnet:?` 下载任务
- 当前运行主链路统一走内置托管的 `aria2`
- renderer 只做 UI 和订阅，不做下载调度
- dashboard 状态同步已经切到 `main -> renderer` 主动推送
- `src/adapters/bt` 里有 qBittorrent 相关代码，但它不是当前生效主链路

## What Not To Assume

不要猜这些事情：

- 不要假设项目仍以 qBittorrent 为当前主链路
- 不要假设 HTTP 下载已经进入当前阶段
- 不要假设 renderer 轮询仍是状态同步方式
- 不要假设 backlog 里的能力已经可用

## Working Rules

- 一次只完成当前阶段最优先的一个任务
- 小步修改，不做大重构
- 不改无关文件
- 核心逻辑优先按 TDD 思路推进：先写失败测试，再补实现，再回归验证
- 完成后更新 `TASKS.md`
- 仅在脚本已存在时运行 `lint / typecheck / test`
- 下载逻辑留在 `main / core / adapter`
- 提交前校验优先交给仓库自动 hook，不依赖 AI 记忆

## Recommended Task Flow

### If asked to implement

1. 先确认任务是否属于当前阶段
2. 阅读相关模块和决策文档
3. 先补一个能描述目标行为或回归问题的失败测试
4. 再做最小实现，让测试通过
5. 补必要测试覆盖边界条件
6. 更新 `TASKS.md`
7. 运行验证脚本

说明：

- 对 `core / main / adapter / task-manager / 状态映射 / 错误处理` 这类核心链路，默认按 TDD 执行
- 对纯样式调整、布局微调这类 UI 改动，不强制先写测试，但如果修复了明确交互回归，仍应补回归测试

### If asked for architecture review

重点检查：

- 是否突破当前阶段边界
- renderer 是否承担了不该有的逻辑
- core 是否在堆积跨层责任
- 错误是否仍然用户可读
- 状态是否仍然可追踪

### If asked for new feature planning

先判断该需求属于：

- 当前阶段
- 下一阶段
- backlog

然后只输出 3-5 个可执行任务，不要直接扩散实现范围。

## Important Files

- `src/core/task-manager/index.ts`
  当前核心状态机
- `src/main/ipc/download-task.ts`
  dashboard 推送和主进程同步入口
- `src/adapters/aria2/index.ts`
  现行下载主链路 adapter
- `src/main/runtime/managed-aria2.ts`
  内置 aria2 托管
- `src/core/task-manager/index.test.ts`
  当前最重要的行为测试
- `src/adapters/aria2/index.test.ts`
  aria2 主链路和回归测试入口

## Known Documentation Status

- `AGENTS.md`：阶段规则和协作约束
- `TASKS.md`：当前任务状态
- `docs/ARCHITECTURE.md`：当前系统现状
- `docs/decisions/*.md`：关键决策记录
- `prompt.md`：给 AI 的简短接手提示入口
- `PLANS.md`：高层路线，不再记录过时实现细节

## Suggested Prompt Template

如果要让 AI 接手一个实现任务，推荐用这种格式：

```text
先读 AGENTS.md、TASKS.md、docs/ARCHITECTURE.md 和相关决策文档。
本次只处理一个任务：<任务名>。
要求：
- 小步修改
- 不改无关文件
- 核心逻辑按 TDD：先写失败测试，再补实现
- 需要时补测试
- 完成后更新 TASKS.md
- 运行现有 lint / typecheck / test
```

如果要让 AI 做评审，推荐用这种格式：

```text
先读 AGENTS.md、TASKS.md、docs/ARCHITECTURE.md。
以架构/代码评审视角看这次改动。
优先指出风险、回归点和测试缺口，不要先讲优点。
```
