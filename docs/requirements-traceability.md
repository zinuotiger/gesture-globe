# P0 requirement traceability

Rows derive from the canonical P0 requirement table, not a second task graph. Each row links to its module test/evidence group below. These are review/navigation links, not an extra blanket PASS: read exact task commands and limitations. Real camera, human gesture, visual and performance/stability evidence remain deferred; model redistribution remains blocked. No exemption is invented by this table. TASK-710 clean-build and final index reports separately cover QA-015 and the release snapshot.

| Requirement | Requirement text                                                                                              | Tests and task evidence    | Acceptance                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------- |
| APP-001     | 首屏优先初始化地球，摄像头默认关闭。                                                                          | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-002     | 启动时完成能力检测，分别报告 WebGL、Worker、MediaDevices 和安全上下文。                                       | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-003     | 全局状态拆分为 appPhase、cameraStatus、visionStatus、gestureStatus、controlSource、selection 和 diagnostics。 | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-004     | 提供“启用手势”“关闭手势”“重试”“恢复默认设置”入口。                                                            | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-005     | 页面 hidden 时暂停视觉推理；返回 visible 时清空旧参考帧再恢复。                                               | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-006     | 销毁流程按手势→视觉→摄像头→地球→监听器顺序释放资源。                                                          | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-007     | 模块初始化失败必须局部隔离，纹理、摄像头、模型或城市数据失败不导致整页白屏。                                  | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-008     | 每次启动手势会话生成 sessionId；事件仅在内存中关联，不包含设备唯一标识。                                      | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-009     | 启动和停止方法幂等；重复点击按钮不会创建两个流或两个 Worker。                                                 | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-011     | 派生 overallStatus：READY、ACTIVE、DEGRADED、ERROR，不用其替代底层状态。                                      | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| APP-012     | 所有模块状态事件携带 timestamp 和 schemaVersion。                                                             | [APP evidence group](#app) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-001     | 渲染地球球体、日间纹理、基础光照、星空和轻量大气层。                                                          | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-002     | 地球 mesh 保持固定，旋转交互优先通过 CameraRig 环绕相机实现。                                                 | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-003     | OrbitControls 作为鼠标/触摸板备用控制，启用阻尼、关闭平移并限制距离。                                         | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-004     | 暴露 applyCommand(command)、getViewState()、cancelTransition() 和 dispose()。                                 | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-005     | 连续 ROTATE/ZOOM 命令基于 deltaTime 执行，并限制最大角速度、极角和距离。                                      | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-006     | RESET_VIEW 在 600～1000ms 内平滑回到一致初始状态。                                                            | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-007     | FOCUS_GEO 将给定经纬度平滑移到可视中心，并可选目标距离。                                                      | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-008     | 首次可低速自动旋转；任何真实用户输入立即暂停，空闲恢复由配置决定。                                            | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-009     | 响应 ResizeObserver、设备像素比和全屏变化；pixelRatio 有上限。                                                | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-010     | 纹理失败时使用备用低分辨率资源或程序化材质。                                                                  | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-011     | 支持 LOW、MEDIUM、HIGH 三档画质，低档关闭云层/后处理并降低 pixelRatio。                                       | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-012     | 处理 webglcontextlost / restored；丢失时暂停渲染并提示。                                                      | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GLB-013     | OverlayLayer 按经纬度锚定标记，标记随视图正确遮挡。                                                           | [GLB evidence group](#glb) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-001     | 仅在用户点击“启用手势控制”后请求摄像头。                                                                      | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-002     | 请求 audio:false；视频约束使用 ideal 而非全部 exact，首选 1280×720、30fps。                                   | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-003     | 调用前验证 secure context、navigator.mediaDevices 和页面活跃状态。                                            | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-004     | 将 NotAllowed、NotFound、NotReadable、Overconstrained、Abort、InvalidState 分类为业务错误。                   | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-005     | 预览对用户镜像显示，但模型原始坐标不被多处重复翻转。                                                          | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-006     | start/stop 幂等；stop 调用所有 track.stop() 并解除 video.srcObject。                                          | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-007     | 只有 video.readyState 和尺寸有效后才允许提交帧。                                                              | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-008     | 监听 track ended、mute/unmute 和设备中断。                                                                    | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-009     | 摄像头预览可隐藏/折叠；隐藏预览不等于停止识别。                                                               | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-010     | 不得录制、上传或持久化原始帧；不得请求麦克风。                                                                | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CAM-012     | 权限请求超过 20s 未决时显示“等待浏览器授权”，允许取消。                                                       | [CAM evidence group](#cam) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-001     | 固定依赖、WASM 和模型版本；生产资源本地托管并记录校验/许可证。                                                | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-002     | Gesture Recognizer 运行模式设为 VIDEO，默认 numHands=1。                                                      | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-003     | 推理在 Dedicated Worker 运行；Worker 不直接访问 DOM 或 Three.js。                                             | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-004     | 主线程通过可转移帧对象提交最新帧，处理完成后显式 close。                                                      | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-005     | 最多 1 帧在途；Worker 忙时不排队旧帧，只记录 droppedBusy。                                                    | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-006     | 默认目标推理频率 24Hz，可在 15～30Hz 范围自适应。                                                             | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-007     | 输出 VisionFrame：frameId、captureTime、resultTime、sourceSize、hands、inferenceMs。                          | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-008     | 每只手输出 handedness、分类候选、21 个图像关键点和 bbox；世界坐标默认可选关闭。                               | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-009     | 结果帧年龄超过 150ms 或 frameId 早于最后应用帧时丢弃。                                                        | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-010     | 初始化协议包含 INIT→READY/ERROR；未 READY 不接受 PROCESS_FRAME。                                              | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-011     | 页面隐藏或手势关闭时 PAUSE；恢复时清空 pending frame。                                                        | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-012     | Worker 崩溃或心跳超时自动重建一次；再次失败进入 DEGRADED。                                                    | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| VIS-013     | Worker 不保存历史原始帧；仅保留当前正在处理的可转移对象。                                                     | [VIS evidence group](#vis) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-001     | 主手优先保持上一帧近邻；丢失后再按置信度与面积选择。                                                          | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-002     | 主手锁定默认 500ms；连续丢失约 180ms 后解除。                                                                 | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-003     | 特征函数纯函数化：distance、palmCenter、palmWidth、bbox、pinchRatio、velocity。                               | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-004     | 掌心默认取关键点 0/5/9/13/17 的均值；掌宽取 5↔17。                                                            | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-005     | Pinch 比例为 distance(4,8)/max(distance(5,17), epsilon)。                                                     | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-006     | 位置与比例使用 EMA，默认 alpha=0.25；指针可使用更高 alpha。                                                   | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-007     | 帧间位移超过可配置上限或间隔超过 150ms 时不生成连续 delta，并重建锚点。                                       | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-008     | 统一优先级 Closed_Fist > Victory > Pinch > Pointing_Up > Open_Palm > None。                                   | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-009     | Open_Palm 连续稳定默认 4 帧后进入 ROTATE；低于保持阈值 3 帧退出。                                             | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-010     | ROTATE 使用平滑掌心逐帧位移，先应用死区，再限幅，再映射到 yaw/pitch。                                         | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-011     | Pinch 进入/退出使用滞后阈值，初值 0.30/0.40，稳定 3 帧。                                                      | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-012     | ZOOM 激活后使用掌心 Y 的增量控制距离；激活首帧只设锚点不发 delta。                                            | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-013     | Closed_Fist 为“离合器”而非开关；默认稳定 2 帧即可中断当前连续手势。                                           | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-014     | Pointing_Up 生成平滑 pointer；仅在地球命中时累计约 650ms 停留。                                               | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-015     | 停留圆半径默认归一化 0.018；超出半径超过容忍时间重置进度。                                                    | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-016     | Victory 稳定 6 帧触发一次 RESET，冷却约 1200ms，并要求离开手势后重新武装。                                    | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-017     | 无手或低置信度时不沿用上一帧 delta；丢手发 END 并清空锚点。                                                   | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-018     | 所有阈值按手势分开配置并做范围校验；代码中不散落魔法数字。                                                    | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GST-019     | 输出 GestureIntent 包含 kind、phase、timestamp、confidence、sourceHandId 和 payload。                         | [GST evidence group](#gst) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-001     | 所有控制来源必须先转成 InputIntent，不允许直接改 Camera 或 mesh。                                             | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-002     | 鼠标/触摸开始后建立默认 800ms 手动来源锁，暂时抑制手势连续命令。                                              | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-003     | Closed_Fist 只暂停手势来源，不阻止用户点击 UI 或使用 Esc。                                                    | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-004     | 任一手动输入取消正在运行的 RESET/FOCUS/Agent 视图过渡。                                                       | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-005     | 连续命令携带 dt，并在映射层限制 yaw、pitch、zoom 的单次和每秒上限。                                           | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-006     | 离散命令使用 rising edge + eventId 去重。                                                                     | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-007     | 鼠标位于按钮、设置面板、文本区域或 camera card 上时不转发地球拖动。                                           | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-008     | 命令进入总线前校验数值有限、范围合法、时间不过期。                                                            | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-009     | 控制来源变化产生 SOURCE_CHANGED 事件供 UI 显示。                                                              | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| INT-010     | SELECT 意图在命中后才生成 SELECT_GEO；取消/丢手产生 SELECT_CANCEL。                                           | [INT evidence group](#int) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-001     | 指针先转换到地球 canvas 局部坐标，再转 NDC[-1,1]。                                                            | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-002     | Raycaster 仅命中 earthPickLayer，并取最近正向交点。                                                           | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-003     | 球面归一化后计算纬度与经度，使用单一 longitudeOffset 校正纹理。                                               | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-004     | 纬度限制 [-90,90]，经度规范化到 [-180,180)。                                                                  | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-005     | 选择进度只在持续命中地球且指针位于停留圆内时增长。                                                            | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-006     | 达到 dwellMs 后只产生一次 selectionId，并进入冷却。                                                           | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-007     | 选择成功显示纬度、经度、最近城市（若在阈值内）和距离。                                                        | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-008     | 内置不少于 100 个全球主要城市，字段含 id、名称、国家/地区、lat、lon。                                         | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-009     | 最近城市使用 Haversine 距离；默认显示阈值 150km，可配置。                                                     | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-010     | 当前 P0 只保留一个选择标记；新选择替换旧标记。                                                                | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| GEO-011     | RESET_VIEW 默认不清除选择；Esc/“清除地点”明确清除。                                                           | [GEO evidence group](#geo) | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-001      | 全屏地球为主视觉；HUD、地点卡和 camera card 不遮挡主要控制区域。                                              | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-002      | 首屏显示“启用手势控制”、鼠标操作提示和本地处理说明。                                                          | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-003      | 首次启用展示 5 个手势的简短说明，可跳过并从帮助重开。                                                         | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-004      | 准备状态显示手是否完整入框、距离是否合适、模型是否就绪。                                                      | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-005      | 状态栏显示 camera、vision、hand、active gesture、control source。                                             | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-006      | CameraCard 默认镜像，叠加 21 点骨架；骨架和预览可分别隐藏。                                                   | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-007      | 候选手势与有效手势视觉上区分；有效操作显示 ROTATE/ZOOM/PAUSE 等。                                             | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-008      | Pointing 期间显示指针、是否命中地球和环形停留进度。                                                           | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-009      | LocationCard 显示城市（若有）、国家/地区、经纬度、距离和清除操作。                                            | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-010      | 错误文案包含“发生了什么、影响什么、下一步怎么做”。                                                            | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-011      | 可恢复错误提供重试；摄像头错误同时提供“继续用鼠标”。                                                          | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-012      | 键盘替代：方向键旋转、+/- 缩放、R 重置、Esc 取消/关闭。                                                       | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-013      | 按钮、开关、对话框有可见焦点、语义标签和键盘操作。                                                            | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-014      | 状态不只用颜色表达，至少同时使用文本或图标。                                                                  | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-015      | 遵循 prefers-reduced-motion：关闭自动旋转、缩短或取消大幅过渡。                                               | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-016      | 宽度 <1024 时折叠次要面板；P0 不承诺手机手势识别。                                                            | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-017      | 设置变更即时生效并显示当前值；危险操作不隐藏。                                                                | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| UI-018      | 诊断层生产默认关闭，可由设置或显式查询参数开启。                                                              | [UI evidence group](#ui)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-001     | 所有关键参数集中到类型化配置，启动时验证。                                                                    | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-002     | 每个参数记录单位、用途、默认值、建议范围和是否允许运行时修改。                                                | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-003     | 区分 dev/test/production；生产关闭调试覆盖和任意 URL 资产注入。                                               | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-004     | AssetManifest 固定模型、WASM、纹理和城市数据路径及版本。                                                      | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-005     | 维护第三方资源来源、许可证和必要署名。                                                                        | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-006     | 城市数据构建时校验 ID 唯一、坐标范围、名称非空和 UTF-8。                                                      | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-007     | 功能开关有 owner、阶段和默认值；P2 Agent 默认关闭。                                                           | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-008     | 配置与 DTO 均带 schemaVersion。                                                                               | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| CFG-009     | 客户端不得包含 API key、私钥或后端密钥。                                                                      | [CFG evidence group](#cfg) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-001     | 采集 render FPS、中位/P95 帧时间。                                                                            | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-002     | 采集 inference FPS、最近/平均/P95 inferenceMs、busy/stale drop。                                              | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-003     | 采集 capture→result→intent→command→visible 的阶段时间戳。                                                     | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-004     | 记录当前 gesture state、来源切换和命令类型，但不记录完整 landmarks。                                          | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-005     | 事件缓冲默认 200 条，超出覆盖最旧项。                                                                         | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-006     | 诊断 UI 更新不超过 4Hz。                                                                                      | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-007     | 对持续低 FPS、推理超时、丢帧率高和 Worker 重启生成健康告警。                                                  | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-008     | 日志禁止图像、完整设备 ID、精确本地路径和用户身份信息。                                                       | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| OBS-010     | 错误事件带 module、code、recoverable、timestamp、sessionId。                                                  | [OBS evidence group](#obs) | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-001      | TypeScript strict，核心类型禁止 any 绕过。                                                                    | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-002      | lint、format check、typecheck、unit、integration、E2E、build 有独立命令。                                     | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-003      | 核心纯函数行/分支覆盖率目标 ≥85%。                                                                            | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-004      | Worker 协议测试覆盖 INIT/READY/PROCESS/RESULT/PAUSE/RESUME/DISPOSE/ERROR。                                    | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-005      | 使用自制关键点序列或许可明确的短视频夹具；不得使用真实用户隐私视频。                                          | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-006      | 集成测试覆盖五类手势的 START/UPDATE/END/TRIGGER。                                                             | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-007      | E2E 覆盖摄像头允许、拒绝、无设备、模型失败、Worker 失败和关闭资源。                                           | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-008      | 视觉回归覆盖 1366×768、1920×1080 的首屏、就绪、错误、选择。                                                   | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-009      | 性能基准使用固定输入，记录机器、浏览器、画质和配置。                                                          | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-010      | 20 分钟稳定性测试监控内存、队列、延迟和错误。                                                                 | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-011      | Chrome/Edge 最近两个主版本做手工摄像头矩阵。                                                                  | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-012      | 隐私测试确认 audio:false、无帧上传、关闭后 tracks ended。                                                     | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-013      | 资产、许可证、bundle 和 source map 策略在 CI 检查。                                                           | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-014      | 需求追踪表映射 requirement→test→evidence。                                                                    | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |
| QA-015      | 发布前从空目录 npm ci 后完成 build 和 preview smoke。                                                         | [QA evidence group](#qa)   | SEE_TASK_EVIDENCE; physical/release debt retained |

## APP

Tests: [unit/app-store.test.mjs](../tests/unit/app-store.test.mjs), [unit/bootstrap.test.mjs](../tests/unit/bootstrap.test.mjs), [integration/bootstrap-config.test.mjs](../tests/integration/bootstrap-config.test.mjs), [e2e/app-status.spec.ts](../tests/e2e/app-status.spec.ts), [e2e/error-center.spec.ts](../tests/e2e/error-center.spec.ts).

Task evidence: `TASK-003`（本地证据，不公开）, `TASK-607`（本地证据，不公开）, `TASK-610`（本地证据，不公开）.

## GLB

Tests: [unit/camera-rig.test.mjs](../tests/unit/camera-rig.test.mjs), [unit/scene-manager.test.mjs](../tests/unit/scene-manager.test.mjs), [unit/transitions.test.mjs](../tests/unit/transitions.test.mjs), [e2e/orbit.spec.ts](../tests/e2e/orbit.spec.ts), [e2e/globe-faults.spec.ts](../tests/e2e/globe-faults.spec.ts).

Task evidence: `TASK-101`（本地证据，不公开）, `TASK-105`（本地证据，不公开）, `TASK-108`（本地证据，不公开）, `TASK-110`（本地证据，不公开）.

## CAM

Tests: [unit/camera-capability.test.mjs](../tests/unit/camera-capability.test.mjs), [unit/camera-permission.test.mjs](../tests/unit/camera-permission.test.mjs), [unit/camera-stream.test.mjs](../tests/unit/camera-stream.test.mjs), [unit/camera-coordinates.test.mjs](../tests/unit/camera-coordinates.test.mjs), [integration/camera-lifecycle.test.mjs](../tests/integration/camera-lifecycle.test.mjs), [e2e/camera-lifecycle.spec.ts](../tests/e2e/camera-lifecycle.spec.ts).

Task evidence: `TASK-201`（本地证据，不公开）, `TASK-202`（本地证据，不公开）, `TASK-203`（本地证据，不公开）, `TASK-204`（本地证据，不公开）, `TASK-205`（本地证据，不公开）, `TASK-207`（本地证据，不公开）, `TASK-208`（本地证据，不公开）.

## VIS

Tests: [contract/vision-messages.test.mjs](../tests/contract/vision-messages.test.mjs), [unit/vision-client.test.mjs](../tests/unit/vision-client.test.mjs), [unit/vision-pause.test.mjs](../tests/unit/vision-pause.test.mjs), [unit/vision-health.test.mjs](../tests/unit/vision-health.test.mjs), [unit/frame-scheduler.test.mjs](../tests/unit/frame-scheduler.test.mjs), [unit/result-normalizer.test.mjs](../tests/unit/result-normalizer.test.mjs), [integration/bitmap-transfer.test.mjs](../tests/integration/bitmap-transfer.test.mjs), [integration/local-model.test.mjs](../tests/integration/local-model.test.mjs).

Task evidence: `TASK-301`（本地证据，不公开）, `TASK-302`（本地证据，不公开）, `TASK-303`（本地证据，不公开）, `TASK-304`（本地证据，不公开）, `TASK-305`（本地证据，不公开）, `TASK-306`（本地证据，不公开）, `TASK-307`（本地证据，不公开）, `TASK-308`（本地证据，不公开）, `TASK-309`（本地证据，不公开）, `TASK-310`（本地证据，不公开）.

## GST

Tests: [unit/landmark-math.test.mjs](../tests/unit/landmark-math.test.mjs), [unit/primary-hand.test.mjs](../tests/unit/primary-hand.test.mjs), [unit/temporal-filter.test.mjs](../tests/unit/temporal-filter.test.mjs), [unit/open-palm.test.mjs](../tests/unit/open-palm.test.mjs), [unit/fist-clutch.test.mjs](../tests/unit/fist-clutch.test.mjs), [unit/pinch-zoom.test.mjs](../tests/unit/pinch-zoom.test.mjs), [unit/victory-reset.test.mjs](../tests/unit/victory-reset.test.mjs), [unit/pointing-pointer.test.mjs](../tests/unit/pointing-pointer.test.mjs), [integration/gesture-replay.test.mjs](../tests/integration/gesture-replay.test.mjs), [integration/gesture-pipeline.test.mjs](../tests/integration/gesture-pipeline.test.mjs).

Task evidence: `TASK-401`（本地证据，不公开）, `TASK-402`（本地证据，不公开）, `TASK-403`（本地证据，不公开）, `TASK-404`（本地证据，不公开）, `TASK-405`（本地证据，不公开）, `TASK-406`（本地证据，不公开）, `TASK-407`（本地证据，不公开）, `TASK-408`（本地证据，不公开）, `TASK-409`（本地证据，不公开）, `TASK-410`（本地证据，不公开）, `TASK-411`（本地证据，不公开）, `TASK-412`（本地证据，不公开）, `TASK-508`（本地证据，不公开）, `TASK-708`（本地证据，不公开）.

## INT

Tests: [unit/source-lock.test.mjs](../tests/unit/source-lock.test.mjs), [unit/intent-command.test.mjs](../tests/unit/intent-command.test.mjs), [unit/command-buffer.test.mjs](../tests/unit/command-buffer.test.mjs), [unit/keyboard-input.test.mjs](../tests/unit/keyboard-input.test.mjs), [integration/interaction-orchestration.test.mjs](../tests/integration/interaction-orchestration.test.mjs), [e2e/orbit.spec.ts](../tests/e2e/orbit.spec.ts).

Task evidence: `TASK-501`（本地证据，不公开）, `TASK-502`（本地证据，不公开）, `TASK-503`（本地证据，不公开）, `TASK-504`（本地证据，不公开）, `TASK-505`（本地证据，不公开）, `TASK-506`（本地证据，不公开）, `TASK-507`（本地证据，不公开）, `TASK-508`（本地证据，不公开）.

## GEO

Tests: [unit/geo-converter.test.mjs](../tests/unit/geo-converter.test.mjs), [unit/geo-picking.test.mjs](../tests/unit/geo-picking.test.mjs), [unit/city-index.test.mjs](../tests/unit/city-index.test.mjs), [unit/dwell-selector.test.mjs](../tests/unit/dwell-selector.test.mjs), [unit/location-selection.test.mjs](../tests/unit/location-selection.test.mjs), [integration/geo-dwell.test.mjs](../tests/integration/geo-dwell.test.mjs), [e2e/markers.spec.ts](../tests/e2e/markers.spec.ts), [e2e/location.spec.ts](../tests/e2e/location.spec.ts).

Task evidence: `TASK-601`（本地证据，不公开）, `TASK-602`（本地证据，不公开）, `TASK-603`（本地证据，不公开）, `TASK-604`（本地证据，不公开）, `TASK-605`（本地证据，不公开）, `TASK-606`（本地证据，不公开）.

## UI

Tests: [unit/app-store.test.mjs](../tests/unit/app-store.test.mjs), [unit/gesture-feedback.test.mjs](../tests/unit/gesture-feedback.test.mjs), [unit/onboarding.test.mjs](../tests/unit/onboarding.test.mjs), [unit/error-center.test.mjs](../tests/unit/error-center.test.mjs), [unit/preferences.test.mjs](../tests/unit/preferences.test.mjs), [e2e/accessibility-layout.spec.ts](../tests/e2e/accessibility-layout.spec.ts), [e2e/onboarding.spec.ts](../tests/e2e/onboarding.spec.ts), [e2e/settings.spec.ts](../tests/e2e/settings.spec.ts).

Task evidence: `TASK-607`（本地证据，不公开）, `TASK-608`（本地证据，不公开）, `TASK-609`（本地证据，不公开）, `TASK-610`（本地证据，不公开）, `TASK-611`（本地证据，不公开）, `TASK-612`（本地证据，不公开）.

## CFG

Tests: [unit/config.test.mjs](../tests/unit/config.test.mjs), [unit/assets.test.mjs](../tests/unit/assets.test.mjs), [unit/preferences.test.mjs](../tests/unit/preferences.test.mjs), [unit/dependency-baseline.test.mjs](../tests/unit/dependency-baseline.test.mjs).

Task evidence: `TASK-001`（本地证据，不公开）, `TASK-006`（本地证据，不公开）, `TASK-007`（本地证据，不公开）, `TASK-611`（本地证据，不公开）.

## OBS

Tests: [unit/metrics.test.mjs](../tests/unit/metrics.test.mjs), [unit/latency-tracer.test.mjs](../tests/unit/latency-tracer.test.mjs), [unit/diagnostic-health.test.mjs](../tests/unit/diagnostic-health.test.mjs), [unit/performance-governor.test.mjs](../tests/unit/performance-governor.test.mjs), [integration/adaptive-scheduler.test.mjs](../tests/integration/adaptive-scheduler.test.mjs), [e2e/diagnostics.spec.ts](../tests/e2e/diagnostics.spec.ts), [e2e/metrics.spec.ts](../tests/e2e/metrics.spec.ts), [e2e/latency.spec.ts](../tests/e2e/latency.spec.ts).

Task evidence: `TASK-701`（本地证据，不公开）, `TASK-702`（本地证据，不公开）, `TASK-703`（本地证据，不公开）, `TASK-704`（本地证据，不公开）.

## QA

Tests: [unit/boundaries.test.mjs](../tests/unit/boundaries.test.mjs), [unit/quality-tools.test.mjs](../tests/unit/quality-tools.test.mjs), [unit/quality-gate.test.mjs](../tests/unit/quality-gate.test.mjs), [unit/assets.test.mjs](../tests/unit/assets.test.mjs), [integration/gesture-replay.test.mjs](../tests/integration/gesture-replay.test.mjs), [integration/slow-inference-stability.test.mjs](../tests/integration/slow-inference-stability.test.mjs), [e2e/fault-matrix.spec.ts](../tests/e2e/fault-matrix.spec.ts), [e2e/privacy.spec.ts](../tests/e2e/privacy.spec.ts), [e2e/stability.spec.ts](../tests/e2e/stability.spec.ts), [unit/documentation-links.test.mjs](../tests/unit/documentation-links.test.mjs).

Task evidence: `TASK-005`（本地证据，不公开）, `TASK-008`（本地证据，不公开）, `TASK-411`（本地证据，不公开）, `TASK-705`（本地证据，不公开）, `TASK-706`（本地证据，不公开）, `TASK-707`（本地证据，不公开）, `TASK-708`（本地证据，不公开）, `TASK-709`（本地证据，不公开）.
