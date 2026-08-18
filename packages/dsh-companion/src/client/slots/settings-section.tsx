import { SettingsCard } from '../../components/settings-card';
import type { ClientRemote, SlotsService } from './slot-types';

export function registerSettingsSection(slots: SlotsService, remote: ClientRemote): () => void {
  return slots.inject('settings.section', () => slots.register(
    {
      name: 'settings.section',
      id: 'whale',
      order: 100,
      label: '我的鲸鱼娘',
      registrant: 'dsh-companion',
      inject: () => ({ remote: remote.travelNoteCompanion }),
    },
    SettingsCard,
  ));
}
