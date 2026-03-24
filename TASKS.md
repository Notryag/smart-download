# TASKS.md

## Current Priority

当前阶段先补 Phase 2 的非 UI 后端能力，再做 UI 收口。

已完成基础诊断事实层、最小策略层和对应测试，历史细项移至 `docs/archive/TASKS_DONE.md`。
已补 `aria2.connections -> task facts` 与 `metadataState` 结构化阶段信号，可区分等待 peer、连接 peer、metadata 交换卡住三类场景。
为了支持后续 AI 自主回归与薄弱点发现，下一步应优先补“共享下载 runtime 装配 + 面向机器的自动化入口”，而不是把产品形态改成独立 CLI。
已抽共享下载 runtime bootstrap，主进程入口改为复用 `createDownloadRuntime()`，下载装配不再直接耦合窗口 / IPC。

## Current Constraints

- 只做 Electron 桌面端
- 当前主链路只做 `magnet -> BT`
- 任务状态必须可追踪
- 失败必须有用户可读提示
- renderer 只负责 UI，下载逻辑放 `main / core / adapter`
- 如需命令行能力，只做内部自动化 / 调试入口，默认输出结构化 JSON，不把产品改造成 CLI

## Next

当前顺序：先补 Phase 2 后端增强，再做 UI 收口，最后再评估多引擎 / AI 扩展。

- [x] 抽共享下载 runtime bootstrap，解耦 Electron 窗口 / IPC 与下载装配，允许自动化入口复用同一主链路
  Entry points: `src/main/index.ts`, `src/main/runtime/managed-aria2.ts`, `src/core/task-manager/index.ts`, `src/storage/index.ts`
- [ ] 提供面向自动化的内部 JSON CLI / harness，最小支持 `create/list/wait/diagnostics/delete`
  Entry points: 先复用 runtime bootstrap；命令面优先新建 `src/cli/*`，避免把 Electron 入口继续做厚
- [ ] 继续补更多网络 / 源侧结构化信号，当前已覆盖 tracker 弱、peer 未连上、metadata 交换卡住，后续补更细的 tracker / peer 边界
  Entry points: `src/core/task-manager/task-facts.ts`, `src/core/task-manager/task-utils.ts`, `src/core/diagnostics/index.ts`, `src/adapters/aria2/utils.ts`
- [ ] 将现有诊断判断继续收口为稳定规则层，统一 `facts -> score -> guidance` 输出
  Entry points: `src/core/task-manager/task-facts.ts`, `src/core/task-manager/task-utils.ts`, `src/core/diagnostics/index.ts`, `src/types/download-task.ts`, `src/types/diagnostics.ts`
- [ ] 收敛 AI 可消费的低歧义输入 schema，补齐缺失字段与边界状态
  Entry points: `src/types/download-task.ts`, `src/types/diagnostics.ts`, `src/main/ipc/download-task.ts`
- [ ] 诊断面板
- [ ] 将任务详情区改造成 inspector，并前置失败原因和操作
- [ ] 将 Header 继续收口为命令栏，进一步弱化说明文案
- [ ] 将运行摘要进一步并入右侧详情区和底部辅助区
- [ ] 继续优化新建任务弹窗的“粘贴即创建”体验
- [ ] qBittorrent BT adapter
- [ ] AI 诊断助手

## Phased Goals

### Phase 1

- 用结构化 facts、score、code 表达当前下载状态
- 保持 `magnet -> BT` 主链路可追踪、可诊断
- 让无 AI 模式下也有最小可读提示

### Phase 2

- 抽共享 runtime 和自动化入口，让 AI / 脚本可以稳定复用真实下载主链路
- 补更多网络 / 源侧结构化信号
- 基于规则引擎做更稳定的策略判断
- 为后续 AI 解释层准备低歧义输入

### Phase 3

- 接入 AI 诊断助手，基于结构化数据生成原因、瓶颈和建议
- 逐步减少硬编码长文案，只保留 fallback 提示
- 评估是否需要多引擎和更复杂下载调度能力

## Archive

- 历史完成项见 `docs/archive/TASKS_DONE.md`
