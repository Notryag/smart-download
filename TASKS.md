# TASKS.md

## Current Priority

当前阶段仍以“下载器式工作区继续收口”为主。

- [ ] 将任务详情区改造成 inspector，并前置失败原因和操作
- [ ] 将 Header 继续收口为命令栏，进一步弱化说明文案
- [ ] 将运行摘要进一步并入右侧详情区和底部辅助区
- [ ] 继续优化新建任务弹窗的“粘贴即创建”体验

## Current Constraints

- 只做 Electron 桌面端
- 当前主链路只做 `magnet -> BT`
- 任务状态必须可追踪
- 失败必须有用户可读提示
- renderer 只负责 UI，下载逻辑放 `main / core / adapter`

## Next

- [ ] 诊断面板
- [ ] 资源健康评分
- [ ] qBittorrent BT adapter
- [ ] AI 诊断助手

## Archive

- 历史完成项见 `docs/archive/TASKS_DONE.md`
