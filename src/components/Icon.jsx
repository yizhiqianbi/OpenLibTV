import React from 'react';
import library from './icons-used.json';

export const iconAliases = {
  terminal: 'icon-console',
  trophy: 'icon-trophy',
  bulb: 'icon-bulb-filled',
  'play-f': 'icon-play-filled',
  star: 'star-l',
  heart: 'heart-l',
  mail: 'mail-n',
  login: 'nt-login',
  'light-dark': 'icon-theme-dark-mode',
};

export function Icon({ name = 'add', size = 18, className = '', ...props }) {
  const icon = library.icons[iconAliases[name] || name];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width || 24} ${icon.height || 24}`}
      fill="none"
      className={`icon ${className}`}
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
export default Icon;
