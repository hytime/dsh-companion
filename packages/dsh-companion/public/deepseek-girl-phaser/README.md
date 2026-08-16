# DeepSeek娘 / 鲸鱼娘 Phaser 资源

## 文件

- `deepseek-girl-atlas.png`：1536×1024 透明 PNG atlas
- `deepseek-girl-atlas.json`：Phaser JSON Hash atlas 数据
- `frames/*.png`：6 张 512×512 透明独立表情帧
- `expression-map.ts`：表达名到帧名的映射

## Phaser 3 加载

```ts
this.load.atlas(
  'deepseek-girl',
  'assets/deepseek-girl-atlas.png',
  'assets/deepseek-girl-atlas.json',
);
```

## 显示与切换表情

```ts
const character = this.add.sprite(400, 300, 'deepseek-girl', 'idle');
character.setFrame('happy');
```

可用帧名：`idle`、`happy`、`smile`、`laugh`、`shy`、`surprised`。
