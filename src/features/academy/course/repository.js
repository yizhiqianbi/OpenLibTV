import { loadContent } from '../../../services/content.ts';
import { mapCourse, mapIntro, mapPracticeCourse, mapProduct } from './model.js';

export class AcademyAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AcademyAccessError';
    this.code = code;
  }
}

/** The default repository reads representative public snapshots; never enrolls or buys a course. */
export function createAcademyRepository({
  load = (options) => loadContent('academy-courses', options),
  loadMarketing = (options) => loadContent('remote-configs', options),
  memberPower,
} = {}) {
  const read = async (kind, id, options) => {
    const data = await load(options);
    const record = data[kind]?.[id];
    if (record?.error) throw new AcademyAccessError(record.error.code, record.error.message);
    return record;
  };
  return {
    async course(id, options) {
      const raw = await read('courses', id, options);
      return raw ? mapCourse(raw) : null;
    },
    async lesson(id, options) {
      const raw = await read('lessons', id, options);
      return raw || null;
    },
    async product(id, options) {
      const raw = await read('products', id, options);
      return raw ? mapProduct(raw) : null;
    },
    async intro(id, options) {
      const raw = await read('overviews', id, options);
      return raw ? mapIntro(raw) : null;
    },
    async practiceCourse(id, options) {
      const raw = await read('courses', id, options);
      return raw ? mapPracticeCourse(raw) : null;
    },
    async practiceSection(id, options) {
      return read('practiceSections', id, options);
    },
    async memberPackages(options) {
      const data = await load(options);
      return data.courseMember || null;
    },
    async marketingConfig(options) {
      const data = await loadMarketing(options);
      return data['292'] || null;
    },
    async courseMemberPower(courseId, options) {
      if (memberPower) return memberPower(courseId, options);
      throw new AcademyAccessError('UNAVAILABLE', '会员权益查询需要运营服务支持');
    },
    async checkout() {
      throw new AcademyAccessError('UNAVAILABLE', '课程购买需要服务端支持，当前未连接支付服务');
    },
  };
}

export const academyRepository = createAcademyRepository();
