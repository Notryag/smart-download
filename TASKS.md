# TASKS.md

## Current Priority

当前阶段先补后端能力，再做 UI 收口。

- [x] 规划并落地 magnet 慢速诊断事实层：补充 seeders、metadata 停留时长、持续 0 speed 时长、tracker / runtime 关键信息
- [x] 基于 magnet 事实层补最小策略层：peer 少时降预期、长时间无速度时补提示与 fallback tracker 说明
- [x] 为 magnet 诊断与策略补充任务流转和用户文案测试，确保状态、提示和建议可追踪

## Current Constraints

- 只做 Electron 桌面端
- 当前主链路只做 `magnet -> BT`
- 任务状态必须可追踪
- 失败必须有用户可读提示
- renderer 只负责 UI，下载逻辑放 `main / core / adapter`

## Next

- [x] 将慢速原因、当前瓶颈和下一步建议并入 inspector / diagnostics，优先做规则驱动说明，不直接依赖 AI
- [x] 资源健康评分
- [x] 将 guidance 收口为 `code + severity + shortMessage`，减少长中文说明
- [x] 将测试从中文文案断言切到 `code / score / level`
- [x] 继续补 magnet 结构化诊断字段，确保 AI 后续能直接读取现状
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

- 补更多网络 / 源侧结构化信号
- 基于规则引擎做更稳定的策略判断
- 为后续 AI 解释层准备低歧义输入

### Phase 3

- 接入 AI 诊断助手，基于结构化数据生成原因、瓶颈和建议
- 逐步减少硬编码长文案，只保留 fallback 提示
- 评估是否需要多引擎和更复杂下载调度能力

## Archive

- 历史完成项见 `docs/archive/TASKS_DONE.md`
