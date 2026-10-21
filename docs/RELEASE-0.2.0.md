# DeepPrompt Lab v0.2.0

面向中文深度学习研究者的提示词工作台更新。此版本将既有模板整理为可直接体验、可复现构建、可测试和可继续贡献的开源项目。

## 使用

- [在线演示](https://asda1740765081.github.io/Deeplearning_prompt/)
- 也可下载本版本源码，直接打开 `index.html`；开发时使用 Node.js 22 和 `npm ci`。
- [三组完整操作案例](https://github.com/Asda1740765081/Deeplearning_prompt/blob/v0.2.0/docs/EXAMPLES.md)

## 本次变化

- 33 个研究模板、7 类研究场景、7 个研究角色模板；改进分类导航、模板卡片、手机布局和深浅主题。
- 支持中文变量、填写草稿恢复、个人模板编辑、文本下载、JSON 合并备份与恢复。
- 新分享链接不含填写材料，并保护已有草稿；兼容旧分享链接。
- 修复变量二次替换；导入增加预校验、去重、ID 冲突重映射与版本检查，存储失败会明确提示。
- 增加可维护的源文件、单文件构建、三个固定输入案例、截图、贡献指南和路线图。

## 已验证范围

发布前执行构建一致性、7 组确定性核心测试、三份案例输出比对，以及 13 项浏览器验收。浏览器检查涵盖填写、刷新恢复、个人模板编辑、备份恢复、分享、角色入口、390px 手机布局、存储失败和本地文件打开。

本地使用 Windows / Edge；CI 使用 Ubuntu / Chromium，记录见 [Actions](https://github.com/Asda1740765081/Deeplearning_prompt/actions/workflows/ci.yml)。具体边界见 [验证说明](https://github.com/Asda1740765081/Deeplearning_prompt/blob/v0.2.0/docs/VALIDATION.md)。

## 已知限制

这是指令准备工具，不调用模型、执行实验、自动运行多个 Agent 或生成 PPTX。案例输入为公开自编材料，没有模型效果或用户效率评测。其他浏览器与完整可访问性尚未全面验证。

个人数据保存在当前浏览器；备份和分享未加密，旧分享可能含填写值。升级继续使用原 `dp-*` 数据键，但不同访问地址之间需要手动导出/导入。多标签同时编辑没有冲突处理。

欢迎按 [贡献指南](https://github.com/Asda1740765081/Deeplearning_prompt/blob/v0.2.0/CONTRIBUTING.md)反馈可复现问题或贡献研究模板。未来计划见 [路线图](https://github.com/Asda1740765081/Deeplearning_prompt/blob/v0.2.0/ROADMAP.md)。
