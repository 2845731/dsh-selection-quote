# dsh-selection-quote（划词引用）

[English](README.md) | **中文**

在 DeepSeek Harness 里随手选中一段文字，变成引用气泡，和模型接着聊。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![test](https://github.com/2845731/dsh-selection-quote/actions/workflows/test.yml/badge.svg)](https://github.com/2845731/dsh-selection-quote/actions/workflows/test.yml)

![编辑框里引用气泡和输入文字混排](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/composer-chips.png)

这是已经插了两个引用的编辑框：气泡和文字可以随意穿插，添加、删除、拖动都跟普通引用节点一样。

## 引用历史问答或 PDF 内容

| 聊天记录里的回答 | 右侧 PDF 预览 |
| --- | --- |
| ![在消息中选中文字后出现「引用」按钮](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/quote-from-chat.png) | ![在 PDF 中选中文字后出现「引用」按钮](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/quote-from-pdf.png) |

鼠标拖选文字 → 点「引用」，这段内容就会以气泡形式出现在输入框里。

- 气泡默认显示引用内容的前几个词（中文取前 12 个字），点开可以看来源和全文；
- 可以插多个气泡、和输入的文字自由混排，每个气泡都能按住拖动换位置；
- 退格一次删掉整个气泡；旁边的滑块按钮可以切换成完整引用（直接把引用正文贴进草稿）；
- PDF 文本层的硬换行会自动拼回段落，标题、空行、列表项保持原样；
- 发送后模型收到完整引用正文，聊天记录里收成可点开的小气泡。

## 安装

Web 界面：**插件 → 添加插件 → 安装第三方插件**，输入包名 `dsh-selection-quote`，完成后点 **立即启用**。命令行：

```powershell
dsh plugin --profile desktop add dsh-selection-quote
```

## 使用

1. 在历史消息或 PDF 预览里拖选文字；
2. 点「引用」（旁边的滑块按钮选引用方式）；
3. 继续输入、插更多引用、拖动气泡调整位置；
4. 发送：模型拿到完整引文，聊天里保留成紧凑气泡。

## 说明

- 基于 DeepSeek Harness `0.2.1-rc.2`（见 `engines.dsh`）。气泡走 DSH 的输入触发引用管线；拖动读取 Lexical 编辑器状态，取不到时只提示失败，不影响其它功能。
- 不联网、无统计；折叠引用的正文只存在本机浏览器 `localStorage`。
- 拖动由两次可撤销的草稿编辑组成，Ctrl+Z 先撤副本、再撤回原位。
- 只有本插件的气泡可拖动，内置 `@文件`、会话引用保持原有行为。
- 非官方社区插件，与 DeepSeek 官方无隶属关系。

## 开发

```powershell
node tests/harness-check.mjs   # 组合包结构
node tests/merge-test.mjs      # PDF 断行合并
node tests/quote-test.mjs      # 气泡载荷与序列化
```

## 许可证

[MIT](LICENSE)
