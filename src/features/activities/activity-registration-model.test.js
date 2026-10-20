import { describe, expect, it } from 'vitest';
import {
  buildActivityRegistrationPayload,
  localActivityRegistrationSource,
  normalizeRegistrationWork,
} from './activity-registration-model.js';

describe('activity registration payload', () => {
  it('normalizes comma and newline separated work links', () => {
    expect(normalizeRegistrationWork(' one\n two，three,\n')).toBe('one,two,three');
    expect(normalizeRegistrationWork('  ')).toBeUndefined();
  });

  it('uses the source payload prefixes and keeps optional work absent', () => {
    expect(
      buildActivityRegistrationPayload({
        item: { activityId: '42', tagId: 7 },
        user: { nickname: '小明' },
        contact: 'wx-id',
        method: 'wechat',
        social: 'https://example.test/me',
        work: '',
      }),
    ).toEqual({
      activityId: 42,
      tagId: 7,
      name: '小明',
      contactInfo: 'wechat:wx-id',
      personalHomepageUrl: 'https://example.test/me',
      description: '社媒主页链接：https://example.test/me\n\n信息真实性：已确认',
    });
  });

  it('provides a successful local adapter without pretending to call a server', async () => {
    const payload = { activityId: 1, name: '本地' };
    await expect(localActivityRegistrationSource().submit(payload)).resolves.toEqual({
      success: true,
      payload,
    });
  });
});
