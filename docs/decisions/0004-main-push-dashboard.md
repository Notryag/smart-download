# 0004 Main Pushes Dashboard Updates

## Status

Accepted

## Decision

将 dashboard 状态同步从 renderer 主动轮询，调整为 main 主进程主动推送。

## Context

旧方案里 renderer 每秒调用：

- `listTasks()`
- `getDiagnostics()`

这会让同步职责落在 UI 层，也容易导致：

- renderer 重复触发状态同步
- main 进程的同步行为分散在多个 IPC 接口中
- 后续若增加订阅能力，需要再反向收口

## Why

- 保持 renderer 只负责展示和订阅
- 把同步责任集中到 main
- 为后续更细粒度事件推送打基础

## Consequences

- IPC 合同增加 `getDashboard()` 和 `onDashboardUpdated()`
- main 进程需要维护统一 dashboard 快照生成逻辑
- create / pause / resume / delete 后需要主动推送一次
- 这类同步行为后续最好补 IPC 级测试
