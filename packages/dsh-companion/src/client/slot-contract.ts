/**
 * settings.plugin.item Slot 的 Client 侧类型声明（SlotMap 增强）。
 *
 * 该 slot 由 DSH 内置 ui-settings-plugins 在运行时声明（settings → Plugins →
 * configurable 页签 → 每插件一张配置卡），本包把同一契约合并进
 * `@deepseek-ai/dsh-client-ui-slots` 的 SlotMap，使注册调用与
 * PropsRuntime<'settings.plugin.item'> 获得类型检查。
 *
 * 与 ui-settings-plugins/src/client/slot-contract.ts 的声明逐字一致
 * （{ kind:'list'; scope:'root'; owner: { children?: never } }）：当两者同时
 * 出现在同一编译程序时，TypeScript 接口合并对同型重复成员静默通过。
 */

/** Owner share of a plugin card（section 不向卡片提供任何 props）。 */
export interface SettingsPluginItemOwnerProps {
  children?: never;
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** 插件配置区里的一张卡片（列表条目，按 order 排序）。 */
    'settings.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps };
    /**
     * 框架级悬浮层（ui-layout 声明，列表条目）。鲸鱼窗与配置卡注册入口；
     * 条目按 order 排序，图层默认点击穿透。
     */
    'shell.overlay': { kind: 'list'; scope: 'root' };
  }
}
