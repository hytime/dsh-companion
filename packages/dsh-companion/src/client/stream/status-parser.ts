import { normalizeStatusUpdate, type StatusUpdate } from '../../utils/status-utils';

export function parseStatusEvent(raw: string): StatusUpdate | null {
  try {
    return normalizeStatusUpdate(JSON.parse(raw));
  } catch {
    return null;
  }
}
