/**
 * Remote 端点身份常量：host 与 client 两个 half 的单一事实源。
 *
 * 两端点的 `<package>#<namespace>/<method>` id、命名空间、方法名与 typeSymbol
 * 只在此声明一次；host（src-json 贡献）与 client（strict+schema 贡献）据此
 * 各自组装，避免两处漂移。
 */

export const REMOTE_PACKAGE = '@your-scope/dsh-companion';
export const REMOTE_SERVICE = 'travelNoteCompanion';
export const REMOTE_NAMESPACE = 'travelNoteCompanion';

export const BUDDY_METHOD = 'buddy';
export const ASSET_METHOD = 'asset';
export const LATEST_REPLY_METHOD = 'latestReply';

export const BUDDY_ENDPOINT_ID = `${REMOTE_PACKAGE}#${REMOTE_NAMESPACE}/${BUDDY_METHOD}`;
export const ASSET_ENDPOINT_ID = `${REMOTE_PACKAGE}#${REMOTE_NAMESPACE}/${ASSET_METHOD}`;
export const LATEST_REPLY_ENDPOINT_ID = `${REMOTE_PACKAGE}#${REMOTE_NAMESPACE}/${LATEST_REPLY_METHOD}`;

export const BUDDY_RESULT_SYMBOL = `${REMOTE_PACKAGE}#${BUDDY_METHOD}:result`;
export const ASSET_FRAME_SYMBOL = `${REMOTE_PACKAGE}#${ASSET_METHOD}:frame`;
export const ASSET_RESULT_SYMBOL = `${REMOTE_PACKAGE}#${ASSET_METHOD}:result`;
export const LATEST_REPLY_RESULT_SYMBOL = `${REMOTE_PACKAGE}#${LATEST_REPLY_METHOD}:result`;

export const STATUS_METHOD = 'status';
export const STATUS_ENDPOINT_ID = `${REMOTE_PACKAGE}#${REMOTE_NAMESPACE}/${STATUS_METHOD}`;
export const STATUS_RESULT_SYMBOL = `${REMOTE_PACKAGE}#${STATUS_METHOD}:result`;
