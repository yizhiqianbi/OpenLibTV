import { withSecondaryData } from '../shared/secondary/SecondaryContent.jsx';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  CircleCheck,
  Play,
  RotateCcw,
  Code,
  Folder,
  Cuboid,
  Music2,
  FileText,
  LoaderCircle,
} from 'lucide-react';
import PluginHero from './components/PluginHero.jsx';
import PluginVideo from './components/PluginVideo.jsx';
import usePluginScroll from './hooks/usePluginScroll.js';
import usePluginPlayback from './hooks/usePluginPlayback.js';
import { STATIC, pluginIcons, names } from '../shared/secondary/libtvAssets.js';
import { template } from '../shared/secondary/text.js';

function PluginPage({ data, asset, toast }) {
  const [agent, setAgent] = useState('openai'),
    [cli, setCli] = useState(false),
    [copied, setCopied] = useState(false),
    [showcase, setShowcase] = useState(0),
    [replay, setReplay] = useState(0),
    [page, setPage] = useState(0),
    [treatment, setTreatment] = useState(0),
    [muted, setMuted] = useState(true);
  const t = data.cli;
  const scroll = usePluginScroll(setShowcase),
    completed = useRef(new Set()),
    conversation = useRef(null),
    playback = usePluginPlayback(showcase, agent, replay, completed);
  const order = [
      'prompt',
      'loading',
      'loadingExit',
      'reply',
      'beforeTool',
      'tool',
      'checklist',
      'summary',
      'complete',
    ],
    shown = (s) => order.indexOf(playback.stage) >= order.indexOf(s),
    complete = playback.stage === 'complete';
  useEffect(() => {
    const view = conversation.current;
    if (view) view.scrollTo({ top: view.scrollHeight, behavior: 'smooth' });
  }, [playback.stage, playback.count]);
  const playAgain = () => {
    completed.current.delete(`${agent}:${showcase}`);
    setReplay((v) => v + 1);
  };
  const mode = cli ? 'CLI' : agent === 'openai' ? 'Plugin' : 'MCP';
  const agentName = ['openclaw', 'hermes', 'codebuddy'].includes(agent) ? names[agent] : 'Agent';
  const prompt = template(
    t[
      cli
        ? 'installCliPrompt'
        : agent === 'openai'
          ? 'installPrompt'
          : ['openclaw', 'hermes', 'codebuddy'].includes(agent)
            ? 'installMcpPrompt'
            : 'installMcpGenericPrompt'
    ],
    {
      agentName,
      brandName: 'PenStudio',
      skillUrl: 'https://liblibai-web-static.liblib.cloud/cli/latest/libtv-cli-skill.zip',
    },
  );
  const showcaseName = ['One', 'Two', 'Three'][showcase];
  const checks = [
    ['Piano', 'Rhythm', 'Edit'],
    ['Outline', 'Layout', 'Review'],
    ['Model', 'Camera', 'Video'],
  ][showcase];
  const title = ['全模型调用生成', '多资产管理提案', '可控多场景生成'];
  const treatmentFiles = [
    [
      'page-01.02fripcth-v_k.jpg',
      'page-02.0ksrctl2qbj-i.jpg',
      'page-03.37dwtusbph_08.jpg',
      'page-04.21jms6cgcg78z.jpg',
      'page-05.1bq4xlvrp-18q.jpg',
      'page-06.3g2-io6p22s-2.jpg',
      'page-07.1xzhryzagk6ot.jpg',
      'page-08.37ybwi478kw9-.jpg',
      'page-09.1jpple-76u_96.jpg',
      'page-10.2fjpkuf6weahu.jpg',
      'page-11.3xd-1k9irzaae.jpg',
      'page-12.2c9g2g4lwz2bo.jpg',
      'page-13.3udwa9mkahje8.jpg',
      'page-14.34wzcuhm2t8df.jpg',
      'page-15.00kt0u6nhg41f.jpg',
    ],
    [
      'page-01.3h0ecknzeby98.jpg',
      'page-02.4095orefszfvm.jpg',
      'page-03.3vs_rxsw0roe7.jpg',
      'page-04.1pc6761wz0b45.jpg',
      'page-05.2fsd809kqtzwk.jpg',
      'page-06.1mfni_s7oypng.jpg',
      'page-07.1rxqoz7mn9sr_.jpg',
      'page-08.341wu7mvwxvgs.jpg',
      'page-09.0z4jue4b16h7_.jpg',
      'page-10.14mow75__gaw8.jpg',
      'page-11.2e-_cijk73ns8.jpg',
      'page-12.0s790guj7z8vp.jpg',
      'page-13.3602v3yny8w-z.jpg',
      'page-14.0987npgjvnguo.jpg',
      'page-15.3r_8jczhzqf7-.jpg',
      'page-16.2g1yni5sypqrj.jpg',
    ],
  ][treatment];
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.('复制失败，请选择并复制文字');
    }
  }
  return (
    <div
      className="secondary-page plugin-page"
      ref={scroll.experience}
      data-showcase-phase={scroll.phase}
    >
      <div
        className="plugin-upper"
        ref={scroll.upper}
        style={{ opacity: 'var(--cli-surrounding-opacity,1)' }}
        aria-hidden={scroll.phase === 'active'}
        {...(scroll.phase === 'active' ? { inert: true } : {})}
      >
        <PluginHero asset={asset} />
        <div className="plugin-intro">
          <h1>PenStudio Plugin，让你的 Agent 开始创作</h1>
          <p>
            借助 PenStudio Plugin 来自动化生成视频或图像，查看{' '}
            <a
              href="https://resonate.feishu.cn/wiki/RjelwT2UoidnTMka2nCc2chGnud"
              target="_blank"
              rel="noreferrer"
            >
              使用指南
            </a>
          </p>
        </div>
        <div className="plugin-install">
          <div className="plugin-install-toolbar">
            <div className="plugin-agent-options" role="radiogroup" aria-label="选择 Agent">
              {Object.keys(names).map((id) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={agent === id}
                  aria-label={names[id]}
                  title={names[id]}
                  className={agent === id ? 'selected' : ''}
                  onClick={() => {
                    completed.current.clear();
                    setAgent(id);
                    setCopied(false);
                  }}
                >
                  <img src={asset(STATIC + pluginIcons[id])} alt="" />
                </button>
              ))}
            </div>
            <div className="plugin-mode-options" role="radiogroup" aria-label="选择接入方式">
              <button
                role="radio"
                aria-checked={!cli}
                className={!cli ? 'selected' : ''}
                onClick={() => setCli(false)}
              >
                <Cuboid size={20} />
                {agent === 'openai' ? 'Plugin' : 'MCP'}
              </button>
              <button
                role="radio"
                aria-checked={cli}
                className={cli ? 'selected' : ''}
                onClick={() => setCli(true)}
              >
                <Code size={20} />
                CLI
              </button>
            </div>
          </div>
          <ol className="plugin-install-steps">
            <li>
              <span className="plugin-step-number">1</span>
              <h2>复制并发送以下内容给你的 {agentName}</h2>
              <p>
                让你的 {agentName} 为你安装好 {mode}
              </p>
              <div className="plugin-prompt-box">
                <pre tabIndex="0" aria-label={`复制并发送以下内容给你的 ${agentName}`}>
                  {prompt}
                </pre>
                <button
                  title={copied ? '已复制' : '复制'}
                  aria-label={copied ? '已复制' : '复制'}
                  onClick={copy}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </li>
            <li>
              <span className="plugin-step-number">2</span>
              <h2>连接账户，开始创作</h2>
              <p>{cli ? t.createCliStepDescription : t.createStepDescription}</p>
            </li>
          </ol>
        </div>
        <h2 className="plugin-showcase-title">看看 PenStudio Plugin 能做什么</h2>
      </div>
      <section className="plugin-showcase">
        <div className="plugin-showcase-track" ref={scroll.track}>
          {title.map((_, i) => (
            <div
              key={i}
              className="plugin-showcase-anchor"
              data-showcase-id={i}
              style={{ top: `calc(var(--cli-showcase-height) * ${i * 0.5})` }}
            />
          ))}
          <div className="plugin-showcase-stage" ref={scroll.stage}>
            <nav aria-label="案例导航">
              {title.map((line, i) => (
                <button
                  key={line}
                  className={showcase === i ? 'selected' : ''}
                  onClick={() => {
                    scroll.select(i);
                    setPage(0);
                  }}
                >
                  {i === 0 ? (
                    <Cuboid size={18} />
                  ) : i === 1 ? (
                    <Folder size={20} />
                  ) : (
                    <RotateCcw size={17} />
                  )}{' '}
                  {line}
                </button>
              ))}
            </nav>
            <div className="plugin-showcase-content" key={`${agent}-${showcase}-${replay}`}>
              <div className="plugin-conversation">
                <header>
                  <img src={asset(STATIC + pluginIcons[agent])} alt={names[agent]} />
                  <button
                    disabled={!complete}
                    aria-label="重新播放演示"
                    title="重新播放演示"
                    onClick={playAgain}
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                </header>
                <div className="plugin-conversation-scroll" ref={conversation}>
                  {showcase === 0 && (
                    <img
                      className="plugin-reference"
                      src={asset(STATIC + 'showcase-1-reference.3dmo2f4qwb-x_.webp')}
                      alt="丝巾参考"
                    />
                  )}
                  <div className="plugin-user-prompt">
                    <span>
                      <img src="/assets/penstudio-mark.svg" alt="" />
                      PenStudio
                    </span>{' '}
                    {template(t[`showcase${showcaseName}Prompt`])}
                  </div>
                  {['loading', 'loadingExit'].includes(playback.stage) && (
                    <div className="plugin-loading-dots">
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                  {shown('reply') && (
                    <p className="plugin-assistant-reply plugin-message">
                      {template(t[`showcase${showcaseName}Reply`])}
                    </p>
                  )}
                  {showcase === 0 && shown('beforeTool') && (
                    <div className="plugin-demo-checks">
                      {checks.slice(0, Math.min(playback.count, 2)).map((key) => (
                        <p className="plugin-message" key={key}>
                          <Check size={14} />
                          <span>{template(t[`showcase${showcaseName}${key}`])}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {shown('tool') && (
                    <div className="plugin-tool">
                      <strong>
                        <img src="/assets/penstudio-mark.svg" alt="" />
                        PenStudio{' '}
                        <span>
                          {complete ? (
                            <CircleCheck size={12} />
                          ) : (
                            <LoaderCircle className="secondary-spin" size={12} />
                          )}
                          通过 PenStudio Plugin 执行
                        </span>
                      </strong>
                      <div className="plugin-tool-card plugin-message">
                        {showcase !== 1 && (
                          <div className="plugin-tool-references">
                            {showcase === 0 ? (
                              <>
                                <img
                                  src={asset(STATIC + 'showcase-1-reference.3dmo2f4qwb-x_.webp')}
                                  alt=""
                                />
                                <span>
                                  <Music2 size={20} />
                                </span>
                              </>
                            ) : (
                              <span>
                                <FileText size={20} />
                              </span>
                            )}
                          </div>
                        )}
                        <p>{template(t[`showcase${showcaseName}Tool`])}</p>
                        <div className="plugin-tool-tags">
                          {(showcase === 0
                            ? [
                                'showcaseModel',
                                'showcaseReference',
                                'showcaseOneRatio',
                                'showcaseAudio',
                              ]
                            : showcase === 1
                              ? [
                                  'showcaseCanvasAssets',
                                  'showcaseStoryboards',
                                  'showcaseCreativeConversation',
                                ]
                              : ['showcaseThreeImageModel', 'showcaseThreeParameters']
                          ).map((tag, i) => (
                            <span key={tag}>
                              {i === 0 ? (
                                <Cuboid size={14} />
                              ) : i === 1 ? (
                                <FileText size={14} />
                              ) : (
                                <Music2 size={14} />
                              )}{' '}
                              {t[tag]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {shown('checklist') && (
                    <div className="plugin-demo-checks">
                      {checks.slice(showcase === 0 ? 2 : 0, playback.count).map((key) => (
                        <p className="plugin-message" key={key}>
                          <Check size={14} />
                          <span>{template(t[`showcase${showcaseName}${key}`])}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {shown('summary') && (
                    <p className="plugin-demo-summary plugin-message">
                      {template(t[`showcase${showcaseName}Summary`])}
                    </p>
                  )}
                </div>
              </div>
              <div className={`plugin-results ${!complete ? 'generating' : ''}`}>
                <div className="plugin-result-label">
                  {complete ? (
                    <CircleCheck size={16} />
                  ) : (
                    <LoaderCircle className="secondary-spin" size={16} />
                  )}{' '}
                  {complete ? '生成结果' : '生成中'}
                </div>
                {showcase === 1 ? (
                  <div className="plugin-treatment">
                    <div
                      className="plugin-treatment-tabs"
                      style={{ visibility: complete ? 'visible' : 'hidden' }}
                    >
                      {['NO HOT WATER', 'Star-Slayer'].map((name, i) => (
                        <button
                          key={name}
                          className={treatment === i ? 'selected' : ''}
                          onClick={() => {
                            setTreatment(i);
                            setPage(0);
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    <div className="plugin-treatment-frame">
                      {complete && (
                        <img
                          src={asset(STATIC + treatmentFiles[page])}
                          alt={`${treatment === 0 ? 'NO HOT WATER' : 'Star-Slayer'}，第 ${page + 1} 页`}
                        />
                      )}
                    </div>
                    <div
                      className="plugin-pagination"
                      style={{ visibility: complete ? 'visible' : 'hidden' }}
                    >
                      <button
                        disabled={page === 0}
                        aria-label="上一页"
                        onClick={() => setPage((v) => v - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        {page + 1} / {treatmentFiles.length}
                      </span>
                      <button
                        disabled={page === treatmentFiles.length - 1}
                        aria-label="下一页"
                        onClick={() => setPage((v) => v + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="plugin-result-scroll">
                    <div
                      className="plugin-result-media-row"
                      style={{ '--cli-media-ratio': showcase === 0 ? 1 : 1518 / 2560 }}
                    >
                      <div className="plugin-video-result">
                        {complete && (
                          <PluginVideo
                            src={asset(
                              STATIC +
                                (showcase === 0
                                  ? 'showcase-1.3-taa85feiwyr.mp4'
                                  : 'showcase-3.3d5c4xt2-79i2.mp4'),
                            )}
                            muted={muted}
                            setMuted={setMuted}
                          />
                        )}
                      </div>
                      <div className="plugin-intermediate-result">
                        {complete && <span>中间产物</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="plugin-workflow" data-visible={scroll.phase === 'after'}>
        <h2>让 PenStudio 进入你的 Agent 工作流</h2>
        <p>
          支持主流 Agent，只需几秒即可将你的 Agent 连接到 PenStudio，
          <br />
          视频、图像、角色——随需而至。
        </p>
        <a
          href="https://resonate.feishu.cn/wiki/RjelwT2UoidnTMka2nCc2chGnud"
          target="_blank"
          rel="noreferrer"
        >
          查看详细教程
          <ArrowUpRight size={13} />
        </a>
      </section>
    </div>
  );
}

const PluginRoutePage = withSecondaryData(PluginPage);
export default PluginRoutePage;
