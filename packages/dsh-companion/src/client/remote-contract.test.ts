import { describe, expect, it } from 'vitest';
import { travelNoteCompanionRemote } from './remote-contract';

describe('travelNoteCompanionRemote', () => {
  it('declares strict direct buddy and asset endpoints', () => {
    expect(travelNoteCompanionRemote.package).toBe('@hytime/dsh-companion');
    expect(travelNoteCompanionRemote.descriptors.map((descriptor) => `${descriptor.namespace}/${descriptor.method}`)).toEqual([
      'travelNoteCompanion/buddy',
      'travelNoteCompanion/asset',
      'travelNoteCompanion/status',
      'travelNoteCompanion/selectAgent',
      'travelNoteCompanion/latestReply',
      'travelNoteCompanion/authStatus',
      'travelNoteCompanion/login',
      'travelNoteCompanion/register',
      'travelNoteCompanion/logout',
      'travelNoteCompanion/getConfig',
      'travelNoteCompanion/setConfig',
      'travelNoteCompanion/listSchedules',
      'travelNoteCompanion/createSchedule',
      'travelNoteCompanion/enableSchedule',
      'travelNoteCompanion/disableSchedule',
      'travelNoteCompanion/deleteSchedule',
    ]);
    for (const descriptor of travelNoteCompanionRemote.descriptors) {
      expect(descriptor.invocation).toEqual({ kind: 'direct' });
      expect(descriptor.result.mode).toBe('strict');
      expect(descriptor.parameters.every((parameter) => parameter.codec.mode === 'strict')).toBe(true);
    }
  });

  it('uses wire parameter names matching the Host @Remote signatures', () => {
    const byMethod = (method: string) =>
      travelNoteCompanionRemote.descriptors.find((descriptor) => descriptor.method === method);
    expect(byMethod('login')?.parameters.map((parameter) => parameter.wire)).toEqual(['username', 'password']);
    expect(byMethod('register')?.parameters.map((parameter) => parameter.wire)).toEqual(['username', 'password']);
    expect(byMethod('setConfig')?.parameters.map((parameter) => parameter.wire)).toEqual(['partial']);
    expect(byMethod('enableSchedule')?.parameters.map((parameter) => parameter.wire)).toEqual(['id']);
    expect(byMethod('disableSchedule')?.parameters.map((parameter) => parameter.wire)).toEqual(['id']);
    expect(byMethod('selectAgent')?.parameters.map((parameter) => parameter.wire)).toEqual(['sessionId']);
    expect(byMethod('listSchedules')?.parameters.every((parameter) => parameter.acceptsUndefined === true)).toBe(true);
    expect(byMethod('createSchedule')?.parameters.map((parameter) => parameter.wire)).toEqual(['text']);
    for (const method of ['authStatus', 'logout', 'getConfig']) {
      expect(byMethod(method)?.parameters).toEqual([]);
    }
  });
});
