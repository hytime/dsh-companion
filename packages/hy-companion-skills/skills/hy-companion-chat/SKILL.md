---
name: hy-companion-chat
description: hy-companion 线上对话。当用户需要与 AI 旅伴进行线上陪伴对话、延续人格聊天或调用 hyc chat 时使用。回复由线上 profile 的人格与对话上下文产生，本技能只调用 hyc 并解释结果。
whenToUse: 用户想与 AI 旅伴对话、倾诉、闲聊，或明确要求"和旅伴聊一下"时
---

# hy-companion-chat 线上对话

把用户输入转发到 `hyc chat`，由线上 companion 服务返回当前 profile 对应人格的回复。本技能不自行产出代替线上回复的文本。

## 何时使用

- 用户想与 AI 旅伴对话、倾诉、闲聊，或明确要求"和旅伴聊一下"。
- 用户给出一句话、一段话，或点名调用 `hyc chat`。
- 需要以当前 profile 的线上人格、记忆和对话上下文回复。

## 对应命令

```bash
hyc chat --msg "<输入>"
```

## 参数透传规则

1. 用户输入未显式包含 `--msg` 时，把整个输入作为消息值执行：

   ```bash
   hyc chat --msg "$ARGUMENTS"
   ```

   `$ARGUMENTS` 指用户去掉命令名后的原始输入；整个值作为一条消息传给线上 CLI，不拆分、不修改。

2. 用户输入已显式给出 `--msg`（例如 `hyc chat --msg "你好"`）时，按原样透传整个参数串，不要重复添加 `--msg`：

   ```bash
   hyc chat --msg "你好"
   ```

3. 用户要求流式输出时，追加 `--stream`：

   ```bash
   hyc chat --msg "$ARGUMENTS" --stream
   ```

4. 其余 CLI 参数（如 profile 相关参数）如用户显式提供则按原样透传；本技能不臆造参数。

## 输出处理

- stdout 的 JSON / JSON Lines 原样作为线上结果呈现给用户，不做二次改写冒充线上回复。
- `--stream` 输出 JSON Lines 时按事件顺序透传文本；出现错误时停止并报告错误。
- 不要吞掉 CLI 的非零退出状态。

## 落盘（供 DSH 前端鲸鱼插件展示）

执行 `hyc chat` 成功后，把结果里的 `reply` 与 `emotion` 字段写入
`~/.hy-companion/state/last-reply.json`（DSH 前端插件的 host half 读它展示在鲸鱼对话窗）：

```bash
mkdir -p ~/.hy-companion/state
# 用 hyc chat 返回的 JSON 字段构造；emotion 缺省用 "idle"
printf '%s\n' '{"reply": <reply JSON 字符串>, "emotion": "<emotion 或 idle>"}' > ~/.hy-companion/state/last-reply.json
```

- 只写 `reply` / `emotion` 两个字段，不写凭据、Token 或完整 CLI 原始输出。
- 失败（非零退出 / 超时 / 取消）时不写该文件，保留 CLI 错误边界。
- `--stream` 收敛后的最终 JSON 同样按此规则落盘。

## 红线

- 禁止由当前会话代替 `hyc chat` 编造回复：用户要的是线上人格的回复，不是本会话模型的文本。
- 未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
