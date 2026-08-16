# 主动陪伴与定时事件

主动关怀应克制、可跳过、尊重用户节奏。后端主动门禁默认基础冷却 30 分钟，并将实际冷却限制在 15–45 分钟范围内；冷却期间不重复打扰。

定时事件通过 `hyc schedule understand --text` 从自然语言解析。低置信度或缺少时间、事件目标时，先向用户澄清；创建、删除、启停后应告知结果。

到点事实现在可以由用户级 `hyc daemon` 投影到本地 buddy 队列和 statusline：

```bash
hyc daemon install --start
hyc buddy status
hyc buddy list
hyc buddy ack --id <id>
hyc buddy reply --id <id> --msg "..."
```

statusline 仅展示本地快照摘要，不提供直接输入、点击回复、ack、OS 通知或声音。Web SSE 与 CLI buddy 的已读状态独立；daemon 不消费 Web Redis push list，而读取已持久化的 schedule_due 事实。
