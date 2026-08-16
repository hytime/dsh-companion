import { describe, expect, it } from 'vitest';
import { travelNoteCompanionRemote } from './remote-contract';

describe('travelNoteCompanionRemote', () => {
  it('declares strict direct buddy and asset endpoints', () => {
    expect(travelNoteCompanionRemote.package).toBe('@hytime/dsh-companion');
    expect(travelNoteCompanionRemote.descriptors.map((descriptor) => `${descriptor.namespace}/${descriptor.method}`)).toEqual([
      'travelNoteCompanion/buddy',
      'travelNoteCompanion/asset',
      'travelNoteCompanion/status',
      'travelNoteCompanion/latestReply',
    ]);
    for (const descriptor of travelNoteCompanionRemote.descriptors) {
      expect(descriptor.invocation).toEqual({ kind: 'direct' });
      expect(descriptor.result.mode).toBe('strict');
      expect(descriptor.parameters.every((parameter) => parameter.codec.mode === 'strict')).toBe(true);
    }
  });
});
