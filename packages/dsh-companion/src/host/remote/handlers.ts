import type { Context } from '@deepseek-ai/cordis';
import {
  checkAuthStatus,
  listSchedules,
  loginWithCredentials,
  logout,
  registerWithCredentials,
  scheduleAction,
  scheduleUnderstand,
} from '../companion-commands';
import { readSettings, writeSettings } from '../settings-store';
import type { SettingsRpcDeps } from '../settings-rpc';
import { createCredentialPtyRunner } from './credentials';

/** Build the default injected dependency table used by CompanionRemote. */
export function createDefaultRpcDeps(ctx: Context): SettingsRpcDeps {
  const ptyRun = createCredentialPtyRunner(ctx);
  return {
    store: { readSettings, writeSettings },
    commands: {
      checkAuthStatus,
      loginWithCredentials: (username, password) => loginWithCredentials(username, password, { ptyRun }),
      registerWithCredentials: (username, password) => registerWithCredentials(username, password, { ptyRun }),
      logout,
      listSchedules,
      scheduleAction,
      scheduleUnderstand,
    },
  };
}
