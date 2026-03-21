# 0002 Managed Aria2 Runtime

## Status

Accepted

## Decision

当前实际下载主链路统一走内置托管的 `aria2c`，由主进程负责启动、检测和停止。

## Context

如果要求用户自己准备 aria2 或其他外部下载器，MVP 运行门槛会明显升高。
当前阶段的重点是验证主链路可运行，而不是验证复杂外部部署。

## Why

- 降低本地环境依赖
- 让开发和演示环境更稳定
- 把下载器可用性检查统一放到 main 进程

## Consequences

- main 进程需要承担 aria2 生命周期管理
- 需要把 RPC 端口、secret、binary path 等细节隐藏在 runtime 层
- 若未来支持多引擎并存，需要重新审视 runtime 管理抽象
