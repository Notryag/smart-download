# 0003 Roll Back Remote Task On Create Failure

## Status

Accepted

## Decision

如果创建任务过程中已经在远端下载引擎创建成功，但本地后续步骤失败，必须主动回滚远端任务。

## Context

创建链路是：

```text
createTask
  -> attachTask
  -> startTask
  -> persist state
```

如果 `attachTask` 成功、但 `startTask` 或后续落库失败，本地会认为任务失败；这时如果不回滚远端任务，就会留下孤儿下载任务，造成状态分叉。

## Why

- 保证“本地任务状态”和“远端下载引擎状态”尽量一致
- 避免孤儿 GID 影响诊断和后续恢复
- 提高失败提示的可信度

## Consequences

- `task-manager` 需要在失败分支中调用 `deleteTask`
- 如果回滚也失败，错误信息必须包含“原始失败 + 回滚失败”
- 相关行为必须有单元测试覆盖
