import '../shared/secondary/styles.css';
import React, { useCallback, useState } from 'react';
import { BlenderHeroScene } from './components/BlenderHeroScene.jsx';
import { useReducedMotion } from './hooks/useReducedMotion.js';
import { BLENDER_ASSETS, detectDownloadPlatform, OVERLAY_DEFAULTS } from './scene-config.js';

function BlenderPage({ asset, navigate }) {
  const platform = detectDownloadPlatform(navigator);
  const reducedMotion = useReducedMotion();
  const [layout, setLayout] = useState({ top: 396.81, titleScale: 1 });
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  const updateLayout = useCallback(
    (value) =>
      setLayout((current) =>
        Math.abs(current.top - value.top) < 0.25 &&
        Math.abs(current.titleScale - value.titleScale) < 0.001
          ? current
          : value,
      ),
    [],
  );
  const url = (os) =>
    `https://libtv-res.liblib.art/director-blender/libtv-blender-${os === 'mac' ? 'macos' : 'windows-x64'}-zh-0.1.26.zip`;
  return (
    <div className="blender-landing">
      <BlenderHeroScene
        asset={asset}
        reducedMotion={reducedMotion}
        sweepActive={hovered || focused}
        onLayout={updateLayout}
      />
      <div
        className="blender-overlay"
        style={{
          '--hero-copy-center': `${layout.top / 2}px`,
          '--title-headline-width': `${419 * layout.titleScale}px`,
          '--sweep-color': OVERLAY_DEFAULTS.sweepColor,
          '--sweep-duration': `${OVERLAY_DEFAULTS.sweepDuration}s`,
          '--sweep-start': `${50 - OVERLAY_DEFAULTS.sweepWidth / 2}%`,
          '--sweep-end': `${50 + OVERLAY_DEFAULTS.sweepWidth / 2}%`,
          '--sweep-brightness': OVERLAY_DEFAULTS.sweepBrightness,
          '--sweep-glow': `${OVERLAY_DEFAULTS.sweepGlow}px`,
          '--connector-opacity': OVERLAY_DEFAULTS.sweepOpacity,
        }}
      >
        <header className="blender-header">
          <a
            className="blender-brand-link"
            href="/"
            onClick={(event) => {
              if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
                event.preventDefault();
                navigate?.('/');
              }
            }}
            aria-label="PenStudio 首页"
          >
            <img src={asset('/assets/penstudio-logo.svg')} alt="PenStudio" />
          </a>
          <nav className="blender-nav" aria-label="首屏导航">
            <a
              target="_blank"
              rel="noreferrer"
              href="https://resonate.feishu.cn/wiki/GwRpwYzGSiESYtkLPBEcvQ4knHd"
            >
              安装指南
            </a>
            <a
              className="blender-director-link"
              target="_blank"
              rel="noopener noreferrer"
              href="/canvas/share?spaceId=4262763&projectId=91172e0005a5499283324d6ba11ef072&isTutorial=true"
            >
              体验 PenStudio 3D 导演台
              <span className="blender-director-arrow" aria-hidden="true" />
            </a>
          </nav>
        </header>
        <main className="blender-hero-copy">
          <div
            className="blender-title-art"
            role="img"
            aria-label="PenStudio × Blender，3D 白模，一键成片"
          >
            <div className="blender-title-brand" aria-hidden="true">
              <img src="/assets/penstudio-blender-title.svg" alt="" />
            </div>
            <div className="blender-headline-slot" aria-hidden="true">
              <div className="blender-headline">
                <div className="blender-headline-crop">
                  <img src={asset('/assets/blender/hero-title.png')} alt="" />
                </div>
                <span className="blender-title-connector" />
              </div>
            </div>
          </div>
          <p className="blender-subtitle">
            在 Blender 内完成白模视频，一键导出到 PenStudio 创作成片
          </p>
          <div
            className="blender-download-group"
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
            }}
          >
            <a
              className="blender-download"
              href={platform ? url(platform) : undefined}
              aria-disabled={!platform}
              onClick={(e) => !platform && e.preventDefault()}
            >
              {platform && (
                <span className="blender-download-icon" data-platform={platform} aria-hidden="true">
                  <img
                    src={asset(
                      platform === 'mac'
                        ? BLENDER_ASSETS.platformMac
                        : BLENDER_ASSETS.platformWindows,
                    )}
                    alt=""
                  />
                </span>
              )}
              下载 PenStudio × Blender 插件
            </a>
            {!platform && (
              <div className="blender-fallback">
                未识别到支持的桌面系统，请选择：<a href={url('mac')}>macOS 版</a>
                <a href={url('windows')}>Windows 版</a>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default BlenderPage;
