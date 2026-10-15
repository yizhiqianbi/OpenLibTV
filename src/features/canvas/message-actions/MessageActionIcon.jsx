import icons from './message-action-icons.json';

export default function MessageActionIcon({ name = 'copy-n' }) {
  const icon = icons[name];
  return icon ? (
    <svg
      width="16"
      height="16"
      viewBox={`0 0 ${icon.width || 24} ${icon.height || 24}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  ) : null;
}
