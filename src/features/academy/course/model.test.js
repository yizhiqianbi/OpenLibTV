// @vitest-environment node
import { describe, expect, it } from 'vitest';
import sample from '../../../../public/data/academy-courses.json';
import {
  firstPlayable,
  mapCourse,
  mapIntro,
  mapPracticeCourse,
  normalizeOutline,
  outlineLeaves,
  productAction,
} from './model.js';
import { AcademyAccessError, createAcademyRepository } from './repository.js';

const courseId = '01a04720890e7d7498763b99b845e1a2';
describe('source course outline and permissions', () => {
  it('preserves all three original outline depths including implicit flat groups', () => {
    const a = { clipUuid: 'a' },
      b = { clipUuid: 'b' };
    const flat = normalizeOutline(
      { outlineDepth: 1, clips: [a], list: [{ lessons: [{ clips: [b] }] }] },
      'course',
    );
    expect(flat[0]).toMatchObject({ id: 'course:flat', implicit: true });
    expect(outlineLeaves(flat)).toEqual([a, b]);
    const two = normalizeOutline(
      { outlineDepth: 2, list: [{ unitUuid: 'unit', clips: [a] }] },
      'course',
    );
    expect(two[0].groups[0]).toMatchObject({ id: 'unit:flat', implicit: true, leaves: [a] });
    const three = normalizeOutline(
      {
        outlineDepth: 3,
        list: [{ unitUuid: 'unit', lessons: [{ lessonUuid: 'group', title: '组', clips: [b] }] }],
      },
      'course',
    );
    expect(three[0].groups[0]).toMatchObject({
      id: 'group',
      title: '组',
      implicit: false,
      leaves: [b],
    });
  });
  it('never unlocks the actual anonymous TOC despite its ALL_OPEN metadata', () => {
    const course = mapCourse(sample.courses[courseId]);
    expect(outlineLeaves(course.units)).toHaveLength(13);
    expect(
      outlineLeaves(course.units).every(
        (leaf) => !leaf.available && leaf.lockReason === 'NOT_ENROLLED',
      ),
    ).toBe(true);
    expect(firstPlayable(course)).toBe('');
    const practice = mapPracticeCourse(sample.courses[courseId]);
    expect(practice.sections.length).toBeGreaterThan(0);
    expect(practice.lastSectionId).toBe(practice.sections[0].sectionId);
  });
  it('chooses only a playable entry and flattens the source intro tree', () => {
    const course = mapCourse({
      courseUuid: 'c',
      outlineDepth: 1,
      currentClipUuid: 'locked',
      clips: [
        { clipUuid: 'locked', playable: false },
        { clipUuid: 'yes', playable: true },
      ],
    });
    expect(firstPlayable(course)).toBe('yes');
    expect(
      mapIntro({
        courseUuid: 'c',
        outline: [{ children: [{ title: 'leaf', displayNo: 1, durationSec: 3 }] }],
      }).outline,
    ).toEqual([{ title: 'leaf', displayNo: 1, durationSec: 3 }]);
  });
  it('does not confuse purchased course access with a course-member package', () => {
    expect(productAction(null, { owned: true }).action).toBe('login');
    expect(productAction({ id: 'fixture' }, { owned: false }).action).toBe('buy');
    expect(productAction({ id: 'fixture' }, { owned: true }).action).toBe('learn');
  });
});

describe('representative public course repository', () => {
  const repository = createAcademyRepository({ load: async () => sample });
  it('exposes the actual 403 and 401 without synthesizing a playable lesson or canvas', async () => {
    await expect(repository.lesson('01a04762c12a7152a21674360f4a2753')).rejects.toMatchObject({
      code: 60003,
    });
    await expect(
      repository.practiceSection('01a04762cd0b73c196f4056c05d1229c'),
    ).rejects.toMatchObject({ code: 10002 });
    expect(await repository.product('unknown-course')).toBeNull();
  });
  it('makes four member plans available for display but never creates a real order', async () => {
    const members = await repository.memberPackages();
    expect(members.packages.map((pkg) => pkg.firstMonthPrice).sort((a, b) => a - b)).toEqual([
      9900, 39900, 49900, 239900,
    ]);
    await expect(repository.checkout({ skuCode: 'fixture' })).rejects.toBeInstanceOf(
      AcademyAccessError,
    );
    await expect(repository.checkout()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
