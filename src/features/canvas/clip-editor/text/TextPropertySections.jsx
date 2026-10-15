import { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
const ordinarySections = ['布局', '文字', '背景', '动画'];
function Section({ title, children, containerRef }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="cv-clip-text-section" ref={containerRef}>
      <button
        className="cv-clip-text-section-heading"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        {open ? <Minus size={16} /> : <Plus size={16} />}
      </button>
      {open && <div className="cv-clip-text-section-content">{children}</div>}
    </section>
  );
}
/** Source s9/s7: all sections remain in the scroll flow; the tabs seek anchors. */
export default function TextPropertySections({
  children,
  sections = ordinarySections,
  label = '文本属性',
}) {
  const anchors = useRef({}),
    [active, setActive] = useState('布局');
  return (
    <>
      <div className="cv-clip-text-tabs" role="group" aria-label={label}>
        {sections.map((title) => (
          <button
            type="button"
            aria-pressed={active === title}
            key={title}
            onClick={() => {
              setActive(title);
              anchors.current[title]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {sections.map((title, index) => (
        <Section
          title={title}
          containerRef={(element) => {
            anchors.current[title] = element;
          }}
          key={title}
        >
          {children[index]}
        </Section>
      ))}
    </>
  );
}
