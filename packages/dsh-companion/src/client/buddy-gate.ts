/**
 * buddy-gate —— client 兜底轮询的 buddy 通道守卫。
 *
 * SSE 断连时 client 用 30s 轮询兜底。host 侧的 buddy 通道（30s 轮询 + SSE
 * 初次推送）已受 reminderEnabled 守卫，但 client 兜底轮询直接调 buddy() RPC、
 * 不经 host 周期调度，故在此按配置过滤：reminderEnabled=false 时不采集
 * （省 3 次 hyc CLI 调用）也不回调 setBuddy。
 *
 * 失败语义：配置读取失败回退为照常采集（fail-open，与 host 读取失败回缺省
 * 的语义一致，避免瞬时配置读取错误误吞提醒）。本函数永不抛出。
 */
import type { BuddyResult, CompanionRemoteFace } from './companion-types';

/** 本模块只依赖 remote 调用面的 getConfig/buddy 两个方法（测试注入最小面）。 */
export type BuddyGateRemote = Pick<CompanionRemoteFace, 'getConfig' | 'buddy'>;

/**
 * 断连轮询的单个 buddy tick：先读配置，reminderEnabled=false 则跳过；
 * 否则采集 buddy 并经 onBuddy 回调（applyBuddy 内部 setBuddy）。
 */
export async function fetchBuddyIfRemindersEnabled(
  remote: BuddyGateRemote,
  onBuddy: (value: BuddyResult) => void,
): Promise<void> {
  try {
    const config = await remote.getConfig();
    if (config.ok && config.value.ok && !config.value.reminderEnabled) return;
  } catch {
    // 配置读取失败：fail-open，照常采集推送
  }
  try {
    const result = await remote.buddy();
    if (result.ok) onBuddy(result.value);
  } catch {
    // 采集失败忽略，下个 tick 重试
  }
}
