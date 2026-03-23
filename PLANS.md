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

## 路线拆分

### Phase 1：结构化诊断基线

- 保持当前主链路只做 `magnet -> BT`
- 先把下载状态、资源健康、慢速原因整理成结构化字段
- 长中文说明逐步收口为 `code + severity + shortMessage`
- 测试优先断言 `code / score / level`，不绑定整句中文

### Phase 2：规则策略与信号扩展

- 继续补充网络和源侧事实层，但只保留 AI 真正需要的结构化数据
- 在规则层完成 peer 稀缺、tracker 稀缺、持续 0 速度等判断
- renderer 只消费结果，不自行推导策略

### Phase 3：AI 解释层

- AI 只基于结构化 facts / score / code 生成自然语言说明
- AI 负责总结“为什么慢、瓶颈在哪、下一步建议”
- 底层规则仍保留兜底，保证无 AI 时也能工作

### Later：平台级优化

- qBittorrent adapter
- 多引擎切换
- 更复杂的网络策略
- 边缘下载、内网 / 外网混合、分发同步

## 暂不做

- 把 AI 当成底层下载优化能力本身
- 提前做平台级分发和边缘下载架构
- 在没有结构化数据前堆更多长中文解释

## 风险

- 下载引擎进程与 RPC 配置仍然复杂
- 状态同步和任务生命周期仍然容易出错
- Electron main / renderer 边界容易混乱
