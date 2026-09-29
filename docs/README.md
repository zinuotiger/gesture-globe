# Gesture Globe

一个在浏览器本地运行的手势地球工程：Three.js 渲染、MediaPipe Worker 推理、纯手势状态机和统一命令入口。摄像头只在用户明确启用后申请，鼠标和键盘路径可独立使用。

**工程代码和自动测试不等于实机验收。** 当前真实摄像头、真人识别、视觉和性能/20分钟稳定性证据仍有延期项；公开模型再分发许可仍为 UNRESOLVED / BLOCKED_PENDING_LICENSE。公开状态见 [项目状态](status.md)。原始账本和人工记录仅在维护者本地保留，不随源码公开；不要从任务编号范围推断验收结果。

## 安装与本地运行

已验证工具链：Node24.14.0、npm11.9.0。安装 Node/npm 后，在仓库根目录使用锁文件：

```sh
npm ci
npm run assets:fetch
npm run assets:verify
npm run dev
```

打开命令输出的本机地址（默认127.0.0.1:5173，端口占用时以实际输出为准）。摄像头需要 localhost/loopback 或 HTTPS 安全上下文；不要通过 file:// 打开。首次教程之后明确启用并允许视频权限，始终不请求音频。拒绝、无设备、模型失败时保留鼠标/键盘操作和明确错误提示。永久拒绝需在浏览器站点设置中处理，再由用户重试，不会反复弹窗。

模型由 assets:fetch 从登记的 Google 固定版本官方源单独下载到 public/models/gesture_recognizer.task，并校验真实 SHA-256；重复运行对已校验副本幂等。来源不明的同名文件会报错，不会被静默覆盖。需要网络的只有首次缺失资产获取；不要自行改成 latest、复制到 Git 或把它放进 dist。详见 [资产策略](asset-policy.md)、[模型目录说明](../public/models/README.md) 和 [NOTICE](NOTICE.md)。SDK Apache-2.0 不代表模型权重许可。

## 操作

拖动地球旋转，滚轮缩放；聚焦地球后方向键旋转、+/-缩放、R复位、Esc取消当前动作。表单编辑和对话框保留各自键盘行为。主控制区提供复位、画质、全屏、帮助和设置。

| 手势        | 行为                                                 |
| ----------- | ---------------------------------------------------- |
| Open Palm   | 稳定进入后移动掌心旋转，停手停止位移                 |
| Pinch       | 捏合进入后上下移动掌心缩放，不用指尖开合量作为缩放量 |
| Closed Fist | 临时离合暂停；松拳后重新建立稳定锚点                 |
| Victory     | 稳定触发一次复位，离开并冷却后才能再次触发           |
| Pointing    | 有效地球区域停留选点；移动、丢手或取消重计时         |

隐藏画面只隐藏预览，摄像头仍在工作；**关闭摄像头**才释放轨道和推理 Worker。设置仅保存白名单偏好与教程完成状态。诊断面板需明确打开，展示有界数值和脱敏事件，不存储真实视频帧或完整关键点流。

## 构建与验证

```sh
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:coverage
npm run build
npm run test:e2e -- --workers=1
npm run release:verify
npm run preview
```

E2E需要已安装的与锁定 Playwright 版本匹配的浏览器；本次使用仓库内 node_modules/.cache/ms-playwright 的浏览器。缺失时记录失败/未运行，不能称浏览器验证通过。代理执行时所有缓存与临时目录均限定仓库内，并使用已安装可信 Node/npm，不通过 npx 下载替代运行时。

`npm run quality` 顺序运行完整自动门禁；[质量说明](quality-gates.md) 解释独立安装检查和报告字段。测试中的合成流、回放和故障注入均有明确标识，不代表真人结果。当前覆盖率门槛只配置于配置 schema，不是全应用覆盖率声明。

`build`校验本地资产，但生产包明确排除外部本地模型；`preview`验证这种生产包，手势模型缺失时应明确降级，不能把它冒充完整公开手势部署。开发服务才可读取已校验的本地模型。`release:verify`当前应返回退出码2，表示许可阻塞；退出码1表示资产/发布内容错误，0也不能替代缺失的人工证据。不要关闭门禁或手工拷贝模型让预览“变绿”。本项目当前未部署、未公开发布。

## 工程与证据入口

- [架构与运行链路](architecture.md)、[模块入口](module-layout.md)、[状态设计](app-state.md)
- [配置](configuration.md)、[调参流程](tuning.md)、[已知限制](known-limitations.md)
- [手势算法](gesture-engine.md)、[统一交互](interaction-contract.md)、[视觉运行时](vision-runtime.md)
- [诊断](diagnostics.md)、[延迟口径](latency.md)、[自适应策略](adaptive-performance.md)
- [摄像头](camera-validation.md)、[隐私](privacy-validation.md)、[视觉](visual-validation.md)、[稳定性](stability-validation.md)、[最终真人矩阵](final-gesture-validation.md)
- [故障矩阵](fault-matrix.md)、[许可证与来源](NOTICE.md)、[规范](Gesture_Globe_实施级需求规格_v3.0.md)

MS-8 提供默认关闭的[工具网关](agent-gateway.md)、受控视图操作及外部数据适配。可选工具面板通过显式组合入口启用；未配置真实服务，不宣称已接入模型 API、天气/路线服务、语音或账号。工程任务通过控制器逐项记录，历史 BLOCKED/FAIL 和延期人工证据保留。完成自动工程后按[集中验收说明](consolidated-acceptance.md)记录真实设备与服务结果。

[P0需求追踪](requirements-traceability.md) 映射规范条目到测试与任务证据；链接本身不授予人工或发布 PASS。
