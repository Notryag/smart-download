# 0001 Stage 1 Magnet Only

## Status

Accepted

## Decision

第一阶段的新建任务入口只允许 `magnet:?` 链接，不接受 HTTP/HTTPS/FTP。

## Context

项目最初目标就是先跑通 `magnet -> BT 下载` 主链路。
如果在 Stage 1 同时保留 URI 输入，会带来两个问题：

- 产品边界不清晰，用户会误以为当前阶段支持通用下载器能力
- 任务模型、错误处理和后续 adapter 设计会过早扩张

## Why

- 收口范围，保证阶段目标单一
- 把复杂度集中在 BT 主链路，而不是协议分发
- 让失败原因更容易解释

## Consequences

- UI 文案和输入校验都必须体现 magnet-only
- `task-manager` 创建入口也必须做后端校验，不能只靠前端限制
- 后续若重新开放 URI，需要新增明确决策记录
