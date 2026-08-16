---
name: hy-companion-route
description: hy-companion 路线建议。当用户需要出行路线规划、起终点路线查询或交通方式建议时使用。通过 hyc route 调用线上路线服务。
whenToUse: 用户想从 A 到 B 的路线、耗时或交通方式建议时
---

# hy-companion-route 路线建议

查询线上路线服务。本技能只调用 `hyc route` 并解释结果，不自行推断路线。

## 何时使用

- 用户想从 A 到 B 的路线、耗时或交通方式建议。

## 对应命令

```bash
hyc route <参数> ...
```

常用示例：

```bash
hyc route --from lat,lng --to lat,lng --mode driving
```

## 参数透传规则

- 按用户给的起终点与出行方式组装参数，其余参数按原样透传。
- 用户未给出坐标时，先向用户确认起终点与出行方式，再执行；不臆造坐标。
- 输出为 JSON，直接呈现路线服务返回的信息。

## 认证失败处理

未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
