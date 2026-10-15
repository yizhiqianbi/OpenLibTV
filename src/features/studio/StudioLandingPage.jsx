import React, { useState, useRef } from 'react';
import Icon from '../../components/Icon.jsx';
import { useData } from '../../data.js';

export default function StudioPage({ navigate, login, user, toast }) {
  const [prompt, setPrompt] = useState(''),
    [menu, setMenu] = useState(null),
    [ratio, setRatio] = useState('16:9'),
    [duration, setDuration] = useState('自动'),
    [model, setModel] = useState('3D-BOX Model Pro'),
    [files, setFiles] = useState([]);
  const file = useRef();
  const config = useData('shell-config', {});
  const examples = config.studio?.prompts || [];
  return (
    <div className="studio-page page-inner">
      <section className="studio-hero">
        <h1>PenStudio 3D-BOX · 你的专业影视空间</h1>
        <p>Agent 轻松搭景，精准调度站位，手绘轨迹实现大片级运镜</p>
        <div className="studio-composer">
          <textarea
            placeholder="描述场景、人物动作和镜头怎么动，AI 帮你生成 3D 动画预演"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {files.map((f) => (
            <span className="file-chip" key={f}>
              {f}
              <button onClick={() => setFiles((fs) => fs.filter((x) => x !== f))}>×</button>
            </span>
          ))}
          <div className="studio-tools">
            <div className="row">
              <button
                className="round-button"
                aria-label="添加附件"
                onClick={() => file.current.click()}
              >
                <Icon name="add" size={20} />
              </button>
              <input
                type="file"
                multiple
                ref={file}
                hidden
                onChange={(e) => setFiles(Array.from(e.target.files).map((f) => f.name))}
              />
              {[
                ['model', model, 'computing'],
                ['ratio', ratio, 'ratio'],
                ['duration', duration, 'clock'],
              ].map(([key, value, icon]) => (
                <div className="popover-anchor" key={key}>
                  <button
                    className="pill-button"
                    onClick={() => setMenu(menu === key ? null : key)}
                  >
                    <Icon name={icon} size={15} />
                    {value}
                  </button>
                  {menu === key && (
                    <div className="popover studio-menu">
                      <h4>
                        {key === 'ratio' ? '画面比例' : key === 'duration' ? '时长' : '模型选择'}
                      </h4>
                      {(key === 'ratio'
                        ? ['16:9', '9:16', '4:3', '3:4', '21:9', '1:1']
                        : key === 'duration'
                          ? ['自动', '5秒', '8秒', '10秒', '12秒', '15秒', '20秒', '30秒']
                          : ['3D-BOX Model Pro', '3D-BOX Model']
                      ).map((v) => (
                        <button
                          onClick={() => {
                            (key === 'ratio'
                              ? setRatio
                              : key === 'duration'
                                ? setDuration
                                : setModel)(v);
                            setMenu(null);
                          }}
                          key={v}
                        >
                          <span>{v}</span>
                          {v === value && <Icon name="check" size={16} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              className="cyan-button"
              disabled={!prompt.trim()}
              onClick={() => (user ? toast('3D 生成服务尚未连接，场景描述已保存在本地') : login())}
            >
              生成
            </button>
          </div>
        </div>
        <div className="studio-examples">
          {examples.map((e) => (
            <button
              onClick={() => {
                setPrompt(e.text);
                setRatio(e.aspectRatio);
                setDuration(e.durationSeconds + '秒');
              }}
              key={e.title}
            >
              {e.title} <Icon name="arrow-up-right" size={14} />
            </button>
          ))}
        </div>
      </section>
      <section className="studio-projects">
        <h2>我的 3D-BOX</h2>
        <button
          className="studio-new"
          onClick={() => (user ? navigate('/animation-preview?newProject=true') : login())}
        >
          <span>
            <Icon name="add" size={32} />
          </span>
          <p>新建空白 3D-BOX</p>
        </button>
        {!user && (
          <button className="studio-login" onClick={login}>
            登录后查看你的 3D-BOX
          </button>
        )}
      </section>
    </div>
  );
}
