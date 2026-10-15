import React from 'react';
import { STATIC, pluginIcons } from '../../shared/secondary/libtvAssets.js';

function PluginHero({ asset }) {
  return (
    <div className="plugin-hero-art" aria-hidden="true">
      <div className="plugin-hero-left">
        {['claudeCode', 'hermes', 'claude'].map((id, i) => (
          <img
            key={id}
            src={asset(STATIC + pluginIcons[id])}
            style={{ width: 36 + i * 16, zIndex: i + 1, filter: `blur(${(2 - i) * 0.75}px)` }}
            alt=""
          />
        ))}
      </div>
      <div className="plugin-hero-right">
        {['openai', 'openclaw', 'codebuddy'].map((id, i) => (
          <img
            key={id}
            src={asset(STATIC + pluginIcons[id])}
            style={{ width: 68 - i * 16, zIndex: 3 - i, filter: `blur(${i * 0.75}px)` }}
            alt=""
          />
        ))}
      </div>
      <img className="plugin-hero-logo" src="/assets/penstudio-mark.svg" alt="" />
    </div>
  );
}

export default PluginHero;
