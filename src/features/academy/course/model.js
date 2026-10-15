const states = { NOT_STARTED: 'not_started', LEARNING: 'learning', DONE: 'done' };

export function normalizeOutline(raw, courseId, mapLeaf = (leaf) => leaf) {
  const depth = raw.outlineDepth === 1 ? 1 : raw.outlineDepth === 3 ? 3 : 2;
  const flatId = (id) => `${id}:flat`;
  const units = raw.list || [];
  if (depth === 1) {
    const leaves = [
      ...(raw.clips || []),
      ...units.flatMap((unit) => [
        ...(unit.clips || []),
        ...(unit.lessons || []).flatMap((lesson) => lesson.clips || []),
      ]),
    ];
    const id = flatId(courseId);
    return [
      {
        id,
        implicit: true,
        groups: [{ id: flatId(id), implicit: true, leaves: leaves.map(mapLeaf) }],
      },
    ];
  }
  return units.map((unit) => ({
    id: unit.unitUuid,
    title: unit.title,
    order: unit.displayNo,
    implicit: false,
    groups:
      depth === 2
        ? [{ id: flatId(unit.unitUuid), implicit: true, leaves: (unit.clips || []).map(mapLeaf) }]
        : (unit.lessons || []).map((lesson) => ({
            id: lesson.lessonUuid,
            title: lesson.title,
            order: lesson.displayNo,
            implicit: false,
            leaves: (lesson.clips || []).map(mapLeaf),
          })),
  }));
}

export const outlineLeaves = (units) =>
  units.flatMap((unit) => unit.groups.flatMap((group) => group.leaves));

export function mapCourse(raw) {
  return {
    courseId: raw.courseUuid,
    title: raw.title,
    creditsGrant: raw.creditsGrant || 0,
    clipTotal: raw.clipTotal || 0,
    clipDone: raw.clipDone || 0,
    lastPracticeNodeUuid: raw.lastPracticeNodeUuid || '',
    practiceEnabled: raw.hasPracticeOutline !== false,
    entrySectionId: raw.currentClipUuid || '',
    defaultExpandedIds: raw.defaultExpandedUuids || [],
    units: normalizeOutline(raw, raw.courseUuid, (clip) => ({
      sectionId: clip.clipUuid,
      order: clip.displayNo,
      title: clip.title,
      durationSec: clip.durationSec,
      status: states[clip.state],
      available: !!clip.playable,
      lockReason: clip.lockReason,
      practiceNodes: (clip.practiceNodes || []).map((node, index, nodes) => ({
        practiceNodeUuid: node.practiceNodeUuid,
        title:
          node.title?.trim() || (nodes.length > 1 ? `${clip.title}（${index + 1}）` : clip.title),
        done: node.progress?.status === 'DONE' || !!node.progress?.doneAt,
      })),
    })),
  };
}

export function mapProduct(raw) {
  return {
    skuCode: raw.skuCode,
    courseId: raw.courseUuid,
    title: raw.title,
    priceOriginal: raw.originPrice || 0,
    priceCurrent: raw.price || 0,
    clipTotal: raw.clipTotal || 0,
    creditsGrant: raw.creditsGrant || 0,
    validDays: raw.validDays || 0,
    materialPkgCount: raw.materialPkgCount || 0,
    owned: raw.purchased === true,
  };
}

export function mapIntro(raw) {
  const flatten = (entries) =>
    entries.flatMap((entry) =>
      entry.children?.length
        ? flatten(entry.children)
        : [
            {
              displayNo: entry.displayNo,
              title: entry.title,
              durationSec: entry.durationSec || 0,
            },
          ],
    );
  return {
    courseId: raw.courseUuid,
    title: raw.title,
    cover: raw.cover,
    tags: raw.tags || [],
    intro: raw.intro || '',
    outline: flatten(raw.outline || []),
    introVideoUrl: raw.introVideoUrl || '',
  };
}

export function productAction(user, info) {
  return user && info.owned
    ? { action: 'learn', label: '立即学习' }
    : {
        action: user ? 'buy' : 'login',
        label: '立即购买',
      };
}

export function firstPlayable(course) {
  const leaves = outlineLeaves(course.units);
  return (
    leaves.find((leaf) => leaf.available && leaf.sectionId === course.entrySectionId)?.sectionId ||
    leaves.find((leaf) => leaf.available)?.sectionId ||
    ''
  );
}

export function mapPracticeCourse(raw) {
  const sections = outlineLeaves(normalizeOutline(raw, raw.courseUuid)).flatMap((clip) =>
    (clip.practiceNodes || []).map((node, index, nodes) => ({
      sectionId: node.practiceNodeUuid,
      order: clip.displayNo,
      title:
        node.title?.trim() || (nodes.length > 1 ? `${clip.title}（${index + 1}）` : clip.title),
      unitId: clip.clipUuid,
      unitTitle: clip.title,
      simulatedDone: node.progress?.status === 'DONE' || !!node.progress?.doneAt,
    })),
  );
  return {
    courseId: raw.courseUuid,
    courseTitle: raw.title,
    creditsGrant: raw.creditsGrant || 0,
    sections,
    lastSectionId: sections.some((section) => section.sectionId === raw.lastPracticeNodeUuid)
      ? raw.lastPracticeNodeUuid
      : sections[0]?.sectionId || '',
  };
}
