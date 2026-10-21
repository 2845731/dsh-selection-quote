# dsh-selection-quote（划词引用）

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-0.2.x-2f6fdb.svg)](https://github.com/2845731/dsh-selection-quote)

**划词 → 变成可拖动引用气泡 → 和模型讨论。**

这是一个 [DeepSeek Harness](https://www.deepseek.com/harness/) 的 Web 客户端插件：在右侧 PDF 预览或聊天记录里
鼠标拖选任意文字，点「引用」即可在输入框中生成一个**原子引用 chip**（和内置 `@文件` 引用同一机制）。
多个 chip 可以和输入的文字任意穿插、可以拖动换位置；发送时每个 chip 会展开成完整引用，模型能读到全文，
而聊天记录里则显示为可点开的小气泡。

> 非官方社区插件。依赖 DSH 0.2.x 的公开组合器/引用管线，详见[兼容性](#兼容性)。

## 功能

- **随处可引用**：右侧 PDF 预览（`[data-pdf-text]`）或对话记录（`[data-chat-flow]`）中选中文字后，
  选区旁出现「引用」浮动按钮。
- **输入框内联 chip**：引用插入在光标处，是原子节点；可与文字混排、可插多个、退格一次删掉整个 chip。
- **拖动排序**：按住 chip 拖动，跟随鼠标显示幽灵气泡，输入框内出现蓝色落点指示线；松开即移动，Esc 取消。
  拖动由两次普通草稿编辑组成，第二步失败会自动回滚，不会出现重复 chip 或删错文字。
- **两种引用方式**（浮动条上的滑块按钮切换，按浏览器记忆）：
  - **完整引用**：插入 `> 引用 · 来源` 加整段正文的明文引用块；
  - **折叠气泡**：插入显示"前三个单词"（中文取前 12 个字符）的 chip。
- **PDF 断行智能合并**：把 PDF 文本层的硬换行拼回段落（连字符断词修复、英文加空格、中文直接相接），
  标题、空行、列表项保留原有分段。
- **发送后气泡**：每条引用在聊天记录中显示为 `“Reviewer’s Comment…”` 小气泡，点开可见来源与全文；
  折叠 chip 在组装消息时被展开成 `> 引用气泡 · 来源` + 正文，因此模型拿到完整内容。
- **纯本地**：无任何网络请求、无统计；折叠引用的正文只存在本机浏览器 `localStorage`。

## 安装

### 在 Web 界面安装

打开 **插件 → 添加插件 → 安装第三方插件**，输入包名 `dsh-selection-quote`（或本地目录路径），
完成后点 **立即启用**。

### 命令行安装

```powershell
# 使用桌面应用自带的 dsh 启动器即可
dsh plugin --profile desktop add dsh-selection-quote
```

安装后当前 profile 会自动登记该组合包并在 Web 客户端热加载，无需重启。

## 使用

1. 在 PDF 预览或历史消息里拖选文字 → 点「引用」；
2. 光标处出现引用 chip（或完整引用模式下是明文引用块）；
3. 在 chip 前后自由输入文字，可插入多个、可拖动换位；
4. 发送后：聊天记录中每条引用是可可展开的气泡，模型收到完整引文。

### 设置

浮动条旁的滑块按钮切换引用方式；选择存在 `localStorage` 的 `dsh-selection-quote/mode`。
折叠引用的正文缓存在 `dsh-selection-quote/quotes`（最多保留最近 200 条）。

## 兼容性

- 基于 DeepSeek Harness `0.2.1-rc.2` 开发测试（见 `package.json` 的 `engines.dsh`）。
- 输入框 chip 依赖 DSH 的输入触发引用管线（`ctx.inputTriggers.registerSource`、会话级
  `slash/input-insert-reference` / `slash/input-consume-token` 事件）。
- 拖动会从组合器 `contenteditable` 根的 `__lexicalEditor` 读取 Lexical 状态来精确计算偏移；
  如果该内部入口不存在，拖动会安全降级（提示失败），chip 的其它功能不受影响。
- 选区识别使用 DSH 渲染的稳定 `data-*` 锚点（`data-pdf-text`、`data-pdf-page`、`data-chat-flow`、
  `data-chat-turn`、`data-composer-seat`、`data-composer-chip`）。

未来 DSH 若重命名这些接缝，需要更新 `client.js`；插件本身不会影响输入框正常使用。

## 已知限制

- DSH 输入框对插件只开放纯文本与引用 chip，因此这里是用引用 chip + CSS 定制的气泡，不是完全自定义的富文本控件。
- 折叠 chip 在发送时从**本机浏览器存储**展开；清除站点数据后，旧 chip 会展开为空字符串（chip 本身仍在草稿里）。
- 一次拖动产生两步可撤销编辑：第一次 Ctrl+Z 撤销副本，再撤一次恢复原位。
- 只有本插件的引用 chip 可拖动；内置 `@文件`/会话 chip 保持原有行为。

## 开发与测试

```powershell
node tests/harness-check.mjs   # 组合包结构：槽位、UserText 规则、引用源注册
node tests/merge-test.mjs      # PDF 断行合并
node tests/quote-test.mjs      # chip 载荷、codec 展开、聊天折叠
```

测试都是纯 Node ESM 脚本，CI 见 `.github/workflows/test.yml`。

## 隐私

插件不发起任何网络请求、不上报任何数据；折叠引用的正文仅存于浏览器 `localStorage`，清除站点数据即删除。

## 许可证

[MIT](LICENSE)。与 DeepSeek 官方无隶属关系；DeepSeek Harness 是 DeepSeek 的产品。
