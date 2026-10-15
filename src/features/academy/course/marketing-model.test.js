import { describe, expect, it } from 'vitest';
import config from '../../../../public/data/remote-configs.json';
import { createAcademyRepository } from './repository.js';
import {
  completionMarketingCandidates,
  resolveClipMinuteSec,
  resolveDailyPopupLimit,
  resolveFollowupGate,
  resolveMarketingPopup,
} from './marketing-model.js';

const course = {
  courseId: 'fixture',
  clipDone: 1,
  clipTotal: 2,
  units: [{ groups: [{ leaves: [{ sectionId: 'first' }, { sectionId: 'second' }] }] }],
};
describe('source course marketing rules', () => {
  it('reads existing marketing config through the content boundary and requires an explicit member-power adapter', async () => {
    const loadMarketing = async (options) => {
      expect(options).toEqual({ force: true });
      return config;
    };
    const repository = createAcademyRepository({ loadMarketing });
    expect(await repository.marketingConfig({ force: true })).toBe(config['292']);
    await expect(repository.courseMemberPower('fixture')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const confirmed = { code: 0, data: { member: { displayName: '仅测试会员' } } };
    const connected = createAcademyRepository({
      memberPower: async (id) => {
        expect(id).toBe('fixture');
        return confirmed;
      },
    });
    expect(await connected.courseMemberPower('fixture')).toBe(confirmed);
  });
  it('uses actual read config292 clip-specific minutes and permits no inferred default', () => {
    const minute = config['292'].clipMinute;
    expect(
      resolveClipMinuteSec(
        minute,
        '01a04720890e7d7498763b99b845e1a2',
        '01a04762c12a7152a21674360f4a2753',
      ),
    ).toBe(150);
    expect(resolveClipMinuteSec(minute, 'fixture', 'first')).toBeUndefined();
    expect(resolveClipMinuteSec({ ...minute, defaultMinute: 2 }, 'fixture', 'first')).toBe(120);
    expect(resolveClipMinuteSec({ ...minute, enabled: false }, 'fixture', 'first')).toBeUndefined();
  });
  it('enforces course restrictions, rejects empty popup content, and prioritizes half-progress over the first clip', () => {
    const settings = config['292'];
    expect(
      completionMarketingCandidates(settings, course, 'first').map((entry) => entry.touch),
    ).toEqual(['progressHalf', 'firstClipDone']);
    expect(completionMarketingCandidates(settings, { ...course, clipTotal: 0 }, 'second')).toEqual(
      [],
    );
    expect(resolveMarketingPopup({ enabled: true, popup: {} }, 'fixture')).toBeNull();
    expect(
      resolveMarketingPopup({ ...settings.firstClipDone, courseUuids: ['other'] }, 'fixture'),
    ).toBeNull();
  });
  it('uses the source threshold fallback and persists deny after a popup takes over', () => {
    const settings = {
      ...config['292'],
      progressHalf: { ...config['292'].progressHalf, threshold: NaN },
    };
    expect(completionMarketingCandidates(settings, course, 'second')).toHaveLength(1);
    expect(resolveDailyPopupLimit({ dailyPopupLimit: -1 })).toBe(2);
    expect(
      resolveFollowupGate({ marketingOpen: false, marketingTookOver: true, holding: false }),
    ).toBe('deny');
    expect(
      resolveFollowupGate({ marketingOpen: false, marketingTookOver: false, holding: true }),
    ).toBe('hold');
  });
});
