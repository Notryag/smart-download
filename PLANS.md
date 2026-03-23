# PLANS.md

## 当前目标
做一个 Electron 桌面端 MVP，先支持 magnet 主链路稳定运行，并把失败原因说清楚。

## 当前基线

- 当前运行主链路统一走内置托管的 aria2
- 新建任务入口只允许 magnet
- 任务状态同步已切到 main 主动推送 renderer
- 核心状态机测试已经补到 task-manager 层

## 当前优先级

以 `TASKS.md` 为准。
这里不再记录逐条实现任务。

## 暂不做

- AI 诊断
- 复杂资源健康评分
- 多引擎自动切换

## 风险

- 下载引擎进程与 RPC 配置仍然复杂
- 状态同步和任务生命周期仍然容易出错
- Electron main / renderer 边界容易混乱
