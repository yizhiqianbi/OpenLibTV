import React, { useEffect, useState } from 'react';
import { ChevronDown, CheckCircle2, Circle, Play } from 'lucide-react';

export default function CourseCatalog({
  course,
  selected,
  onSelect,
  onPractice,
  previous,
  next,
  failed = false,
  onRetry,
}) {
  const [expanded, setExpanded] = useState(() => new Set(course.defaultExpandedIds));
  const currentGroupId = course.units
    .flatMap((unit) => unit.groups)
    .find((group) => group.leaves.some((leaf) => leaf.sectionId === selected))?.id;
  // The source renderer treats a newly loaded course as a new catalog state. Do not
  // carry a previous course's manual expansion choices into the next detail response.
  useEffect(() => {
    setExpanded(new Set(course.defaultExpandedIds ?? []));
  }, [course]);
  useEffect(() => {
    const group = course.units
      .flatMap((unit) => unit.groups)
      .find((entry) => entry.leaves.some((leaf) => leaf.sectionId === selected));
    if (group) setExpanded((value) => new Set([...value, group.id]));
  }, [course.units, selected]);
  const toggle = (id) =>
    setExpanded((value) => {
      const copy = new Set(value);
      copy.has(id) ? copy.delete(id) : copy.add(id);
      return copy;
    });
  const leaf = (section) => (
    <li key={section.sectionId}>
      <button
        className={`academy-course-leaf ${selected === section.sectionId ? 'current' : ''}`}
        aria-current={selected === section.sectionId ? 'true' : undefined}
        disabled={!section.available}
        onClick={() => onSelect(section.sectionId)}
      >
        {section.available &&
          (selected === section.sectionId ? (
            <Play size={14} />
          ) : section.status === 'done' ? (
            <CheckCircle2 size={14} />
          ) : (
            <Circle size={14} />
          ))}
        <span>{section.title}</span>
        {!section.available && <small>即将更新</small>}
      </button>
      {selected === section.sectionId && section.practiceNodes?.length > 0 && (
        <ul className="academy-course-practice-nodes">
          {section.practiceNodes.map((node) => (
            <li key={node.practiceNodeUuid}>
              <span>{node.title}</span>
              <button onClick={() => onPractice(node.practiceNodeUuid)}>
                {node.done ? '已完成' : '去跟练'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
  if (failed)
    return (
      <div className="academy-route-state">
        <button onClick={onRetry}>目录加载失败，点击重试</button>
      </div>
    );
  return (
    <div className="academy-course-catalog">
      <div className="academy-course-catalog-scroll">
        {course.units.map((unit) => (
          <section key={unit.id}>
            {!unit.implicit && (
              <h2>
                <small>第 {unit.order} 单元</small>
                {unit.title}
              </h2>
            )}
            {unit.groups.map((group) => (
              <div key={group.id}>
                {!group.implicit && (
                  <button
                    className="academy-course-group"
                    aria-expanded={expanded.has(group.id)}
                    onClick={() => toggle(group.id)}
                  >
                    <ChevronDown
                      size={14}
                      style={{ transform: expanded.has(group.id) ? '' : 'rotate(-90deg)' }}
                    />
                    {group.order} {group.title}
                  </button>
                )}
                {(group.implicit || expanded.has(group.id) || group.id === currentGroupId) && (
                  <ul>{group.leaves.map(leaf)}</ul>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
      <footer>
        <button disabled={!previous} onClick={previous}>
          上一节
        </button>
        <button disabled={!next} onClick={next}>
          下一节
        </button>
      </footer>
    </div>
  );
}

export function CourseCatalogSkeleton() {
  return (
    <aside className="academy-course-skeleton-catalog" aria-hidden="true">
      <div className="academy-course-desktop-catalog-skeleton">
        {[
          [75, 66, 80],
          [66, 75],
        ].map((rows, index) => (
          <section key={index}>
            <i className="academy-course-shimmer" style={{ width: 32, height: 12 }} />
            <i className="academy-course-shimmer" style={{ width: '50%', height: 16 }} />
            {rows.map((width, row) => (
              <div key={row}>
                <i className="academy-course-shimmer" style={{ width: 14, height: 14 }} />
                <i className="academy-course-shimmer" style={{ width: `${width}%`, height: 16 }} />
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="academy-course-mobile-catalog-skeleton">
        <i className="academy-course-shimmer" />
        {[0, 1, 2].map((row) => (
          <div key={row}>
            <span className="academy-course-shimmer" />
            <div>
              <i className="academy-course-shimmer" />
              <i className="academy-course-shimmer" />
            </div>
          </div>
        ))}
      </div>
      <footer>
        <i className="academy-course-shimmer" />
        <i className="academy-course-shimmer" />
      </footer>
    </aside>
  );
}
