import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhaleFloatingWidget } from './whale-floating-widget';
import type { SkillStatus } from '../contracts/skill-contract';

const STATUSES: readonly SkillStatus[] = [
  'idle',
  'connecting',
  'thinking',
  'replying',
  'success',
  'error',
  'cancelled',
];

/** 悬浮人物触发器：aria-label 为 `<名称>：<状态>`。 */
function getTrigger(): HTMLElement {
  return screen.getByRole('button', { name: /(旅伴|小小梦)：/ });
}

describe('WhaleFloatingWidget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('默认只显示悬浮人物，对话窗未展开', () => {
    render(<WhaleFloatingWidget status="idle" />);
    expect(getTrigger()).toBeInTheDocument();
    expect(screen.queryByText(/等待输入当前对话/)).not.toBeInTheDocument();
    // 不创建任何聊天输入框
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.querySelector('textarea')).not.toBeInTheDocument();
  });

  it('点击人物展开对话窗，再次点击收起', async () => {
    const user = userEvent.setup();
    render(<WhaleFloatingWidget status="idle" />);
    const trigger = getTrigger();
    await user.click(trigger);
    expect(screen.getByText(/等待输入当前对话/)).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByText(/等待输入当前对话/)).not.toBeInTheDocument();
  });

  it('对话窗显示旅伴名称与最新 buddy 消息', async () => {
    const user = userEvent.setup();
    render(
      <WhaleFloatingWidget
        status="idle"
        companionName="小小梦"
        buddyTitle="下午茶"
        buddyMessage="该给自己泡杯茶配个小点心"
      />,
    );
    await user.click(getTrigger());
    expect(screen.getByText(/小小梦/)).toBeInTheDocument();
    // 打字机逐字显示（toast 与对话窗消息），findByText 轮询等待完成
    await screen.findByText(/该给自己泡杯茶配个小点心/, undefined, { timeout: 3000 });
  });

  it('点击关闭按钮收起对话窗', async () => {
    const user = userEvent.setup();
    render(<WhaleFloatingWidget status="success" />);
    await user.click(getTrigger());
    await user.click(screen.getByRole('button', { name: /关闭/i }));
    expect(screen.queryByText(/已返回当前对话/)).not.toBeInTheDocument();
  });

  it('Escape 收起对话窗', async () => {
    const user = userEvent.setup();
    render(<WhaleFloatingWidget status="idle" />);
    await user.click(getTrigger());
    expect(screen.getByText(/等待输入当前对话/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText(/等待输入当前对话/)).not.toBeInTheDocument();
  });

  it.each(STATUSES)('状态 %s 反映在 aria-label', (status) => {
    render(<WhaleFloatingWidget status={status} />);
    const trigger = getTrigger();
    expect(trigger.getAttribute('aria-label')).toContain(status);
  });

  it('error 状态显示最近错误，回复按钮触发 onReply', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    render(
      <WhaleFloatingWidget
        status="error"
        lastError="hyc chat 超时"
        companionName="小小梦"
        onReply={onReply}
      />,
    );
    await user.click(getTrigger());
    expect(screen.getByText(/hyc chat 超时/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /和小小梦聊聊/i }));
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it('Skill 执行期间不渲染任何输入框（不阻塞当前对话）', async () => {
    const user = userEvent.setup();
    render(<WhaleFloatingWidget status="replying" />);
    await user.click(getTrigger());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.querySelector('input')).not.toBeInTheDocument();
    expect(document.querySelector('textarea')).not.toBeInTheDocument();
  });

  it('使用鲸鱼娘形象并按 emotion 切换表情帧', () => {
    const { rerender } = render(<WhaleFloatingWidget status="idle" />);
    const img = () => document.querySelector('img') as HTMLImageElement;
    expect(img().getAttribute('src')).toContain('/deepseek-girl-phaser/frames/idle.png');
    rerender(<WhaleFloatingWidget status="thinking" emotion="happy" />);
    expect(img().getAttribute('src')).toContain('/deepseek-girl-phaser/frames/happy.png');
    rerender(<WhaleFloatingWidget status="error" />);
    expect(img().getAttribute('src')).toContain('/deepseek-girl-phaser/frames/surprised.png');
  });

  it('支持拖动：按住移动后人物跟随指针，且不触发对话窗展开', async () => {
    const user = userEvent.setup();
    render(<WhaleFloatingWidget status="idle" />);
    const trigger = getTrigger();
    await user.pointer({ keys: '[MouseLeft>]', target: trigger, coords: { x: 10, y: 10 } });
    await user.pointer({ coords: { x: 90, y: 60 } });
    await user.pointer({ keys: '[/MouseLeft]' });
    // 拖动后不应展开对话窗
    expect(screen.queryByText(/等待输入当前对话/)).not.toBeInTheDocument();
    const container = trigger as HTMLElement;
    expect(Number.parseFloat(container.style.left)).toBeGreaterThan(40);
    expect(Number.parseFloat(container.style.top)).toBeGreaterThan(30);
  });

  it('拖动后位置保存到 localStorage，重新渲染时恢复', async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    const first = render(<WhaleFloatingWidget status="idle" />);
    const trigger = getTrigger();
    await user.pointer({ keys: '[MouseLeft>]', target: trigger, coords: { x: 10, y: 10 } });
    await user.pointer({ coords: { x: 90, y: 60 } });
    await user.pointer({ keys: '[/MouseLeft]' });
    const saved = JSON.parse(window.localStorage.getItem('dsh-companion.whale.pos') ?? '{}') as {
      left: number;
      top: number;
    };
    expect(typeof saved.left).toBe('number');
    expect(typeof saved.top).toBe('number');
    first.unmount();
    render(<WhaleFloatingWidget status="idle" />);
    const container = getTrigger() as HTMLElement;
    expect(Number.parseFloat(container.style.left)).toBeCloseTo(saved.left);
    expect(Number.parseFloat(container.style.top)).toBeCloseTo(saved.top);
  });

  it('回复气泡默认从人物左缘向右展开(left=0)', async () => {
    // 人物放左侧(20,300),气泡 300px:20+300<1016 → 右展开 left=0
    window.localStorage.setItem('dsh-companion.whale.pos', JSON.stringify({ left: 20, top: 300 }));
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 60,
      top: 0,
      left: 0,
      right: 300,
      bottom: 60,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    render(<WhaleFloatingWidget status="idle" latestReply="默认向右展开的回复" />);
    const text = await screen.findByText(/默认向右展开的回复/, undefined, { timeout: 3000 });
    const bubble = text.parentElement as HTMLElement;
    expect(bubble.style.left).toBe('0px');
    rect.mockRestore();
  });

  it('人物贴右缘时回复气泡向左展开(宽度超过人物)', async () => {
    window.localStorage.clear();
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 480,
      height: 60,
      top: 0,
      left: 0,
      right: 480,
      bottom: 60,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    render(<WhaleFloatingWidget status="idle" latestReply="右侧空间不足，气泡向左展开" />);
    const text = await screen.findByText(/右侧空间不足，气泡向左展开/, undefined, { timeout: 3000 });
    const bubble = text.parentElement as HTMLElement;
    // 默认位置 left=878（视口 1024 - 人物 130 - 边距 16），气泡宽 480：
    // 878+480 > 1024-8 → 向左展开 left = 130-480 = -350
    expect(bubble.style.left).toBe('-350px');
    rect.mockRestore();
  });
});

describe('companion.css 约束', () => {
  it('只使用 dsh-companion 命名空间并支持 prefers-reduced-motion', () => {
    const css = readFileSync(resolve(__dirname, '../styles/companion.module.css'), 'utf8');
    const classNames = [...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1] as string);
    for (const name of classNames) {
      expect(name.startsWith('dsh-companion')).toBe(true);
    }
    expect(css).toContain('prefers-reduced-motion');
  });
});
