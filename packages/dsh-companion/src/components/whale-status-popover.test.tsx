/**
 * WhaleStatusPopover 好感度区块守卫单测:
 * showAffection=false 时 host 把 9 个好感度字段置 0 —— 全 0 载荷不渲染
 * 好感度/亲密度/信任感/活跃度 4 行(与悬浮条 affectionScore > 0 隐藏逻辑一致)。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WhaleStatusPopover } from './whale-status-popover';
import type { AffectionStats } from '../contracts/skill-contract';

/** showAffection=false 时 host 侧 applySettingsToBuddy 产出的全 0 载荷。 */
const ZERO_AFFECTION: AffectionStats = {
  affectionScore: 0,
  intimacyScore: 0,
  trustScore: 0,
  engagementScore: 0,
  talkativenessFactor: 0,
  proactiveProbabilityFactor: 0,
  cooldownFactor: 0,
  lastEvaluatedDate: '',
  lastAnnouncedDate: '',
};

const AFFECTION_LABELS = ['好感度', '亲密度', '信任感', '活跃度'];

function renderPopover(affection?: AffectionStats) {
  return render(
    <WhaleStatusPopover companionName="旅伴" status="idle" affection={affection} />,
  );
}

describe('WhaleStatusPopover 好感度区块', () => {
  it('affection 全 0(showAffection=false 的 host 载荷):不渲染好感度区块(含 4 行)', () => {
    renderPopover(ZERO_AFFECTION);
    for (const label of AFFECTION_LABELS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('affection 缺省(未传入):不渲染好感度区块', () => {
    renderPopover();
    for (const label of AFFECTION_LABELS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('affectionScore > 0:渲染好感度 4 行指标', () => {
    renderPopover({ ...ZERO_AFFECTION, affectionScore: 42, intimacyScore: 30 });
    for (const label of AFFECTION_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });
});
