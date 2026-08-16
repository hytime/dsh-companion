---
name: hy-companion-affection
description: hy-companion 亲密度。当用户想查看与 AI 旅伴的亲密度或情感状态时使用。通过 hyc affection 读取线上情感状态。
whenToUse: 用户想了解与旅伴的亲密度、情感值或近期互动状态时
---

# hy-companion-affection 亲密度

查看当前 profile 与线上旅伴的亲密度/情感状态。本技能只调用 `hyc affection` 并解释结果。

## 何时使用

- 用户想了解与旅伴的亲密度、情感值或近期互动状态。

## 对应命令

```bash
hyc affection
```

## 参数透传规则

- 本命令无必选参数；用户显式给出的参数按原样透传给 `hyc affection ...`。
- 输出为 JSON，直接呈现亲密度信息。

## 认证失败处理

未登录、Token 过期、网络失败或参数错误时，保留 CLI 的错误边界，并用简短中文说明下一步（例如先运行 `hyc login`）。
