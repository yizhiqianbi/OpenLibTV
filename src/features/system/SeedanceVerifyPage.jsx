import '../shared/secondary/styles.css';
import React, { useState } from 'react';
import { ShieldCheck, Search, Info } from 'lucide-react';

function SeedanceVerify({ navigate, user, login, toast }) {
  const [task, setTask] = useState(() => new URLSearchParams(location.search).get('taskId') || ''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const value = task.trim();
  let invalid = '';
  if (value) {
    if (!/^\d{14,}$/.test(value)) invalid = 'TaskId 不合法';
    else {
      const year = +value.slice(0, 4),
        month = +value.slice(4, 6),
        day = +value.slice(6, 8),
        hour = +value.slice(8, 10),
        minute = +value.slice(10, 12),
        second = +value.slice(12, 14);
      if (
        year < 2020 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31 ||
        hour > 23 ||
        minute > 59 ||
        second > 59
      )
        invalid = 'TaskId 不合法';
      else if (value.slice(0, 8) < '20260608') invalid = '仅支持 2026-06-08 及之后的任务核验';
    }
  }
  function verify() {
    if (!value || invalid || loading) return;
    if (!user) {
      login();
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('taskId', value);
    history.replaceState(history.state, '', url);
    setLoading(true);
    setError('');
    setTimeout(() => {
      setLoading(false);
      setError('查询失败，请稍后重试');
      toast?.('核验服务尚未连接，当前为前端演示');
    }, 800);
  }
  return (
    <div className="seedance-verify-page">
      <header>
        <button onClick={() => navigate('/')} aria-label="PenStudio 首页">
          <img src="/assets/penstudio-logo.svg" alt="PenStudio" />
        </button>
        <span />
        <a
          href="https://www.volcengine.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="火山引擎首页"
        >
          <img src="/assets/volcengine-logo.svg" alt="火山引擎" />
        </a>
      </header>
      <main>
        <div className="seedance-data-source">
          <div>
            <ShieldCheck size={24} />
          </div>
          <p>
            <strong>数据来源：火山方舟 · 官方查询接口</strong>
            <span>官方平台 · 客观公正</span>
          </p>
        </div>
        <h1>Seedance 任务核验</h1>
        <section className="seedance-input">
          <p>
            输入 <strong>Task ID</strong> 核验本次生成实际调用的模型
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <input
              aria-label="Task ID"
              placeholder="请输入 Task ID"
              value={task}
              onChange={(e) => {
                setTask(e.target.value);
                setError('');
              }}
            />
            <button type="submit" disabled={!value || !!invalid || loading}>
              <Search size={18} />
              {loading ? '核验中...' : '开始核验'}
            </button>
          </form>
          {invalid ? (
            <p className="seedance-error">{invalid}</p>
          ) : (
            <p className="seedance-readonly">
              <span>✓</span>只读查询接口，不会重新生成、不消耗算力、不产生任何费用。
            </p>
          )}
        </section>
        <section className="seedance-result">
          {loading ? (
            <p className="seedance-querying">正在向 火山方舟 核验任务实际调用的模型...</p>
          ) : error ? (
            <>
              <p className="seedance-error" role="alert">
                {error}
              </p>
              <button type="button" className="seedance-retry" onClick={verify}>
                重试
              </button>
            </>
          ) : (
            <>
              <div>
                <Search size={28} />
              </div>
              <h2>输入 Task ID 并点击「开始核验」</h2>
              <p>系统将向火山方舟官方接口拉取任务记录，核验实际调用的模型版本</p>
            </>
          )}
        </section>
        <aside>
          <Info size={16} />
          <p>
            <strong>关于本页：</strong>本核验页直连火山方舟官方任务查询接口，展示平台原始返回数据。
            <code> model </code>字段即为本次生成实际调用的模型，由火山方舟签发。
          </p>
        </aside>
      </main>
    </div>
  );
}

export default SeedanceVerify;
