# Project status

Beta / Portfolio project。Engineering implementation complete；Automated test suite available；Manual acceptance in progress。状态日期：2026-09-29。

## Engineering implementation

**PASS（工程实现范围）**：原始 84 张任务卡的自动工程准备已实现，包含模块化视觉 Worker、手势引擎、输入仲裁、地球/地点、诊断与默认关闭的 Agent 工具接口。人工任务仍保留延期，不将工程完成解释为全部验收通过。

## Automated validation

自动检查包含 lint、format、typecheck、unit、contract、integration、浏览器 E2E、build 和资产策略验证。**PASS 只能对应实际运行的具体检查**；实时结果见仓库 Actions，未运行的检查为 **NOT_RUN**。自动测试使用合成视频、确定性回放和本地 SDK，不能证明真人识别、设备性能或长时稳定性。

本轮公开准备前的本地报告记录上述门禁 PASS，许可检查为预期阻塞；该历史记录不替代公开分支的新一轮验证。覆盖率范围仅为配置 schema / 共享 DTO。

## Human acceptance

| 项目                    | 状态               | 边界                                                  |
| ----------------------- | ------------------ | ----------------------------------------------------- |
| 手指捏合缩放            | PARTIAL            | 用户确认基本可用，完整真人矩阵未完成                  |
| 鼠标滚轮缩放            | DEFERRED           | 原晃动反馈为 FAIL；已修复并通过自动回归，等待真人复测 |
| V 字复位                | DEFERRED           | 执行断点已修复；等待真人识别及完整复位复测            |
| 张掌、握拳、食指选择    | NOT_RUN / PARTIAL  | 仍需逐项真人诊断，不虚构单项结论                      |
| 手势动画图解            | DEFERRED           | 已实现及自动检查；主观易用性待确认                    |
| 摄像头与隐私            | PARTIAL / DEFERRED | 局部开关反馈不代表全部权限、占用指示和隐私验收        |
| 真实性能、20 分钟稳定性 | NOT_RUN / DEFERRED | 自动短测不能替代真实设备数据                          |
| 主观视觉与最终人工评审  | DEFERRED           | 尚未完整确认                                          |

## External integration

**NOT_RUN（真实服务）**：Agent 适配器接口、契约测试与 loopback HTTP 测试已完成。未配置真实地理编码、天气或路线提供方；默认关闭。没有宣称完成真实外部联调，也未启用账号、语音或云端后端。

## Release and licensing

**BLOCKED_BY_LICENSE**：模型为 EXTERNAL_LOCAL / UNRESOLVED。`release:verify` 当前返回 2 属于 **EXPECTED BLOCKED**，不是发布 PASS。模型不进入 Git 或构建公开清单；SDK Apache-2.0 不覆盖模型权重。

源码公开与应用部署/模型再分发是独立动作。本项目未部署、未创建 GitHub Release、未启用 Pages。项目源代码 LICENSE 尚未由作者指定；第三方许可见 [NOTICE](NOTICE.md)。

状态词：PASS=该项真实通过；FAIL=该项失败；PARTIAL=证据不完整；NOT_RUN=未执行；DEFERRED=验收延期；BLOCKED_BY_LICENSE=许可阻止发布。原始本地故障、修复和人工记录保留但不公开。
