/**
 * settings.section Slot 的 Client 侧类型声明（SlotMap 增强）。
 *
 * 该 slot 由 DSH 内置 ui-settings 声明（设置面板 → 左侧导航每条目一个设置页），
 * 本包把同一契约合并进 `@deepseek-ai/dsh-client-ui-slots` 的 SlotMap，使
 * 注册调用与 PropsRuntime<'settings.section'> 获得类型检查。
 *
 * 与 ui-settings/src/client/contract/slots.ts 的声明一致
 * （{ kind:'list'; scope:'root'; owner: SettingsSectionOwnerProps }）：
 * 当两者同时出现在同一编译程序时，TypeScript 接口合并对同型重复成员静默通过。
 */

/** Owner share of a settings section entry（shell 拥有面板开关与导航）。 */
export interface SettingsSectionOwnerProps {
  /** 关闭设置面板（shell 拥有 open 状态）。 */
  close: () => void;
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** 设置面板左侧导航里的一个设置页（列表条目，按 order 排序）。 */
    'settings.section': { kind: 'list'; scope: 'root'; owner: SettingsSectionOwnerProps };
    /**
     * 框架级悬浮层（ui-layout 声明，列表条目）。鲸鱼窗与配置卡注册入口；
     * 条目按 order 排序，图层默认点击穿透。
     */
    'shell.overlay': { kind: 'list'; scope: 'root' };
  }
}
