import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Code,
  Folder,
  FolderOpen,
  Maximize,
  Minimize,
  FileText,
  LoaderCircle,
  Upload,
  Eye,
  FolderPlus,
  FilePlus2,
  WandSparkles,
  MoreHorizontal,
  Layers2,
} from 'lucide-react';
import Modal from '../../../../components/Modal.jsx';
import SkillRichEditor from './SkillRichEditor.jsx';
import SkillMarkdownDiff from './SkillMarkdownDiff.jsx';
import SkillTreeMenu from './SkillTreeMenu.jsx';
import { skillDiffLines, skillDiffStats } from '../editor-diff.js';
import {
  parentPath,
  pathContains,
  relocateSkillEntry,
  skillDirectories,
  SKILL_TREE_DRAG_TYPE,
} from '../file-tree-model.js';
import '../styles/file-tree.css';
import { template } from '../../../shared/secondary/text.js';
import {
  MAX_SKILL_FILES,
  MAX_SKILL_FILE_BYTES,
  mergeSkillFiles,
  skillFileLimit,
} from '../skill-form.js';

const SkillCodeEditor = lazy(() => import('./SkillCodeEditor.jsx'));

function SkillFileEditor({
  files,
  setFiles,
  dirs,
  setDirs,
  selected,
  setSelected,
  mode,
  setMode,
  t,
  error,
  toast,
  onUploadBusyChange,
  onlineContents,
  diffEnabled = false,
}) {
  const [expanded, setExpanded] = useState(false),
    [uploadMenu, setUploadMenu] = useState(false),
    [entry, setEntry] = useState(null),
    [context, setContext] = useState(null),
    [deleteFile, setDeleteFile] = useState(null),
    [replace, setReplace] = useState(null),
    [generation, setGeneration] = useState(0),
    [focused, setFocused] = useState(false),
    [optimizeError, setOptimizeError] = useState(''),
    [collapsed, setCollapsed] = useState(new Set()),
    [dropTarget, setDropTarget] = useState(null),
    [treeError, setTreeError] = useState(''),
    [uploading, setUploading] = useState(false),
    [entryFocusRequest, setEntryFocusRequest] = useState(0);
  const md = useRef(null),
    folder = useRef(null),
    file = files.find((f) => f.path === selected);
  const alive = useRef(true),
    uploadRequest = useRef(0),
    latestFiles = useRef(files),
    latestSelected = useRef(selected),
    drag = useRef(null),
    longPress = useRef(null),
    skipPointerClick = useRef(false),
    completedEntry = useRef(null),
    entryInput = useRef(null),
    activeEditor = useRef(null),
    positions = useRef(new Map());
  latestFiles.current = files;
  latestSelected.current = selected;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      uploadRequest.current += 1;
      clearTimeout(longPress.current?.timer);
    };
  }, []);
  useEffect(() => {
    onUploadBusyChange?.(uploading);
    return () => onUploadBusyChange?.(false);
  }, [uploading, onUploadBusyChange]);
  const entryOpen = Boolean(entry);
  useEffect(() => {
    // Focus after the closing menu restores its opener, so the new editor keeps focus.
    if (entryOpen) {
      entryInput.current?.focus();
      entryInput.current?.select();
    }
  }, [entryOpen, entryFocusRequest]);
  const deletedPaths = useMemo(
    () =>
      new Set(
        mode === 'diff' && diffEnabled
          ? Object.keys(onlineContents || {}).filter((path) => !files.some((f) => f.path === path))
          : [],
      ),
    [mode, diffEnabled, onlineContents, files],
  );
  const treeFiles = useMemo(
    () => [...files, ...[...deletedPaths].map((path) => ({ path, content: '' }))],
    [files, deletedPaths],
  );
  const allDirs = useMemo(() => skillDirectories(treeFiles, dirs), [treeFiles, dirs]);
  const diffStats = useMemo(
    () =>
      mode === 'diff'
        ? new Map(
            treeFiles.map((file) => [
              file.path,
              skillDiffStats(skillDiffLines(onlineContents?.[file.path] || '', file.content)),
            ]),
          )
        : new Map(),
    [mode, onlineContents, treeFiles],
  );
  function rememberPosition() {
    const position = activeEditor.current?.getPosition();
    if (position) positions.current.set(`${selected}:${mode}`, position);
  }
  function switchMode(next) {
    rememberPosition();
    if (next !== 'diff' && deletedPaths.has(selected))
      setSelected(files.find((file) => file.path === 'SKILL.md')?.path || files[0]?.path);
    setMode(next);
    setOptimizeError('');
  }
  function fullscreen(value) {
    rememberPosition();
    setExpanded(value);
  }
  function reportTreeError(error) {
    setTreeError(error.message);
    toast?.(error.message);
  }
  function relocate(from, next, conflict) {
    try {
      const result = relocateSkillEntry(files, dirs, from, next, {
        locked: t.createSkillPrimaryFileLocked,
        conflict,
      });
      setFiles(result.files);
      setDirs(result.dirs);
      setSelected(result.mapPath(selected));
      setCollapsed((paths) => new Set([...paths].map(result.mapPath)));
      positions.current = new Map(
        [...positions.current].map(([key, position]) => {
          const separator = key.lastIndexOf(':');
          return [result.mapPath(key.slice(0, separator)) + key.slice(separator), position];
        }),
      );
      setTreeError('');
      return true;
    } catch (error) {
      reportTreeError(error);
      return false;
    }
  }
  function dragOver(event, target) {
    event.stopPropagation();
    if (!drag.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  }
  function drop(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const from = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!from) {
      reportTreeError(new Error('请拖动当前文件树中的文件或文件夹'));
      return;
    }
    if (parentPath(from) === target) return;
    const next = [target, from.split('/').at(-1)].filter(Boolean).join('/');
    relocate(from, next, t.createSkillMoveConflict);
  }
  function openContext(event, row) {
    if (deletedPaths.has(row.path)) return;
    event.preventDefault();
    event.stopPropagation();
    cancelLongPress();
    (event.currentTarget.matches('button')
      ? event.currentTarget
      : event.currentTarget.querySelector('button')
    )?.focus();
    const rect = event.currentTarget.getBoundingClientRect();
    setContext({ ...row, x: event.clientX || rect.left, y: event.clientY || rect.bottom });
    setUploadMenu(false);
  }
  function cancelLongPress() {
    clearTimeout(longPress.current?.timer);
    longPress.current = null;
  }
  function startLongPress(event, row) {
    skipPointerClick.current = false;
    if (event.button !== 0 || deletedPaths.has(row.path)) return;
    cancelLongPress();
    const { clientX, clientY, currentTarget } = event;
    longPress.current = {
      x: clientX,
      y: clientY,
      timer: setTimeout(() => {
        currentTarget.querySelector('button')?.focus();
        skipPointerClick.current = true;
        setContext({ ...row, x: clientX, y: clientY });
        setUploadMenu(false);
        longPress.current = null;
      }, 500),
    };
  }
  const directory = allDirs.includes(selected);
  function setContent(content) {
    setFiles((fs) => fs.map((f) => (f.path === selected ? { ...f, content } : f)));
  }
  function select(path) {
    rememberPosition();
    setSelected(path);
    setContext(null);
    setEntry(null);
    setOptimizeError('');
  }
  function applyFiles(next) {
    const merged = mergeSkillFiles(latestFiles.current, next);
    if (!validateFiles(merged)) return false;
    setFiles(merged);
    setSelected(
      merged.some((f) => f.path === latestSelected.current)
        ? latestSelected.current
        : merged.find((f) => f.path === 'SKILL.md')?.path || merged[0]?.path || 'SKILL.md',
    );
    setGeneration((v) => v + 1);
    return true;
  }
  function validateFiles(next) {
    const limit = skillFileLimit(next);
    if (limit) {
      toast?.(
        limit === 'count'
          ? template(t.createSkillFolderMaxFiles, { max: MAX_SKILL_FILES })
          : template(t.createSkillFolderMaxSize, { max: MAX_SKILL_FILE_BYTES / 1048576 }),
      );
      return false;
    }
    return true;
  }
  async function upload(e, isFolder) {
    const input = e.target,
      chosen = [...input.files];
    input.value = '';
    if (!chosen.length) return;
    const relativePath = (f) => {
      const path = (isFolder && f.webkitRelativePath) || f.name;
      const rootEnd = isFolder ? path.indexOf('/') : -1;
      return rootEnd < 0 ? path : path.slice(rootEnd + 1);
    };
    let valid = chosen.filter(
      (f) =>
        /\.(md|markdown)$/i.test(f.name) &&
        !relativePath(f)
          .split('/')
          .some((p) => p.startsWith('.')),
    );
    if (!valid.length) {
      toast?.(t.createSkillFolderNoMd);
      return;
    }
    if (valid.length > MAX_SKILL_FILES) {
      toast?.(template(t.createSkillFolderMaxFiles, { max: MAX_SKILL_FILES }));
      return;
    }
    if (valid.reduce((n, f) => n + f.size, 0) > MAX_SKILL_FILE_BYTES) {
      toast?.(template(t.createSkillFolderMaxSize, { max: MAX_SKILL_FILE_BYTES / 1048576 }));
      return;
    }
    const request = ++uploadRequest.current;
    setUploading(true);
    try {
      const next = await Promise.all(
        valid.map(async (f) => ({
          path: relativePath(f),
          content: await f.text(),
          contentType: 'text/markdown',
          primary: relativePath(f) === 'SKILL.md',
        })),
      );
      if (!alive.current || request !== uploadRequest.current) return;
      const current = latestFiles.current;
      if (!validateFiles(mergeSkillFiles(current, next))) return;
      const conflicts = next.filter((f) =>
        current.some((old) => old.path === f.path && old.content.trim()),
      );
      if (conflicts.length) setReplace({ next, names: conflicts.map((f) => f.path).join('、') });
      else applyFiles(next);
    } catch {
      if (alive.current && request === uploadRequest.current)
        toast?.(t.createSkillReadFolderFailed);
    } finally {
      if (alive.current && request === uploadRequest.current) setUploading(false);
    }
  }
  function createEntry() {
    if (!entry || completedEntry.current === entry) return;
    const name = entry.name.trim();
    let error = !name
      ? t.createSkillEntryNameEmpty
      : name.includes('/')
        ? t.createSkillEntryNameInvalid
        : null;
    const suffix = entry.rename && !entry.dir ? entry.old.match(/\.[^./]+$/)?.[0] || '' : '';
    let path = [entry.parent, name].filter(Boolean).join('/');
    if (suffix)
      path = [
        entry.parent,
        name.toLowerCase().endsWith(suffix.toLowerCase())
          ? name.slice(0, -suffix.length) + suffix
          : name + suffix,
      ]
        .filter(Boolean)
        .join('/');
    else if (!entry.dir && !/\.(md|markdown)$/i.test(name)) path += '.md';
    if (entry.rename && path === entry.old) {
      setEntry(null);
      return;
    }
    if (files.some((f) => f.path === path) || allDirs.includes(path))
      error = t.createSkillEntryNameConflict;
    if (error) {
      setEntry({ ...entry, error });
      return;
    }
    completedEntry.current = entry;
    if (entry.rename) {
      if (!relocate(entry.old, path, t.createSkillEntryNameConflict)) {
        completedEntry.current = null;
        return;
      }
    } else if (entry.dir) setDirs((ds) => [...ds, path]);
    else {
      if (files.length >= MAX_SKILL_FILES) {
        completedEntry.current = null;
        toast?.(template(t.createSkillFolderMaxFiles, { max: MAX_SKILL_FILES }));
        return;
      }
      setFiles((fs) => [
        ...fs,
        { path, content: '', contentType: 'text/markdown', primary: false },
      ]);
      setSelected(path);
    }
    setEntry(null);
  }
  function renameEntry(row) {
    const name = row.path.split('/').at(-1),
      suffix = row.dir ? '' : name.match(/\.[^./]+$/)?.[0] || '';
    setEntry({
      dir: row.dir,
      parent: parentPath(row.path),
      name: suffix ? name.slice(0, -suffix.length) : name,
      old: row.path,
      rename: true,
    });
    setEntryFocusRequest((value) => value + 1);
    setContext(null);
  }
  function startEntry(dir) {
    const parent = directory
      ? selected
      : selected?.includes('/')
        ? selected.slice(0, selected.lastIndexOf('/'))
        : '';
    setCollapsed((paths) => {
      const next = new Set(paths);
      next.delete(parent);
      return next;
    });
    setEntry({ dir, parent, name: '', rename: false });
    setEntryFocusRequest((value) => value + 1);
    setContext(null);
  }
  function removeEntry() {
    if (!deleteFile) return;
    setFiles((fs) =>
      fs.filter((f) => f.path !== deleteFile && !f.path.startsWith(deleteFile + '/')),
    );
    setDirs((ds) => ds.filter((d) => d !== deleteFile && !d.startsWith(deleteFile + '/')));
    if (pathContains(deleteFile, selected)) setSelected('SKILL.md');
    setCollapsed((paths) => new Set([...paths].filter((path) => !pathContains(deleteFile, path))));
    setDeleteFile(null);
  }
  function optimize() {
    if (!file?.content.trim()) {
      toast?.(t.createSkillOptimizeEmptyContent);
      return;
    }
    const message = '内容优化服务尚未连接，当前文件内容已保留。';
    setOptimizeError(message);
    toast?.(message);
  }
  const tools = (inDialog = false) => (
    <>
      <div className="secondary-skill-editor-mode">
        {[
          ['preview', Eye, t.createSkillPreviewMode],
          ['code', Code, t.createSkillCodeMode],
          ...(diffEnabled ? [['diff', Layers2, t.createSkillDiffMode]] : []),
        ].map(([id, I, label]) => (
          <button key={id} className={mode === id ? 'active' : ''} onClick={() => switchMode(id)}>
            <I size={12} />
            {label}
          </button>
        ))}
      </div>
      <i />
      <div className="secondary-skill-upload-menu">
        <button
          aria-label={t.createSkillUpload}
          title={t.createSkillUpload}
          aria-haspopup="menu"
          aria-expanded={Boolean(uploadMenu)}
          disabled={uploading}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setUploadMenu((value) => (value ? false : { x: rect.left, y: rect.bottom }));
          }}
        >
          {uploading ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
        </button>
        {uploadMenu && expanded === inDialog && (
          <SkillTreeMenu
            label={t.createSkillUpload}
            x={uploadMenu.x}
            y={uploadMenu.y}
            onClose={() => setUploadMenu(false)}
            items={[
              { label: t.createSkillUploadFile, action: () => md.current.click() },
              { label: t.createSkillUploadFolder, action: () => folder.current.click() },
            ]}
          />
        )}
      </div>
      <button
        aria-label={t.createSkillContentOptimizeTitle}
        title={t.createSkillContentOptimizeTitle}
        disabled={!file}
        onClick={optimize}
      >
        <WandSparkles size={14} />
      </button>
    </>
  );
  function tree(parent = '', depth = 0) {
    const rows = [
      ...allDirs
        .filter((d) => (d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '') === parent)
        .map((path) => ({ path, dir: true })),
      ...treeFiles
        .filter(
          (f) => (f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '') === parent,
        )
        .map((f) => ({ path: f.path, dir: false })),
    ].sort((a, b) =>
      a.path === 'SKILL.md'
        ? -1
        : b.path === 'SKILL.md'
          ? 1
          : a.dir === b.dir
            ? a.path.localeCompare(b.path)
            : a.dir
              ? -1
              : 1,
    );
    return rows.map((row) => (
      <React.Fragment key={row.path}>
        <div
          className={`secondary-skill-tree-row ${dropTarget === row.path ? 'drop-target' : ''}`}
          draggable={row.path !== 'SKILL.md' && !deletedPaths.has(row.path)}
          onDragStart={(event) => {
            cancelLongPress();
            if (row.path === 'SKILL.md' || deletedPaths.has(row.path)) {
              event.preventDefault();
              reportTreeError(new Error(t.createSkillPrimaryFileLocked));
              return;
            }
            drag.current = row.path;
            setContext(null);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(SKILL_TREE_DRAG_TYPE, row.path);
            event.dataTransfer.setData('text/plain', row.path);
          }}
          onDragEnd={() => {
            drag.current = null;
            setDropTarget(null);
          }}
          onDragOver={(event) => dragOver(event, row.dir ? row.path : parent)}
          onDrop={(event) => drop(event, row.dir ? row.path : parent)}
          onContextMenu={(event) => openContext(event, row)}
          onPointerDown={(event) => startLongPress(event, row)}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onPointerMove={(event) => {
            if (
              longPress.current &&
              (Math.abs(event.clientX - longPress.current.x) > 8 ||
                Math.abs(event.clientY - longPress.current.y) > 8)
            )
              cancelLongPress();
          }}
        >
          <button
            title={row.path}
            aria-current={selected === row.path ? 'page' : undefined}
            aria-expanded={row.dir ? !collapsed.has(row.path) : undefined}
            className={`secondary-skill-file ${selected === row.path ? 'active' : ''} ${deletedPaths.has(row.path) ? 'deleted' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onKeyDown={(event) => {
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
                openContext(event, row);
            }}
            onClick={(event) => {
              if (skipPointerClick.current && event.detail) {
                skipPointerClick.current = false;
                return;
              }
              skipPointerClick.current = false;
              select(row.path);
              if (row.dir)
                setCollapsed((paths) => {
                  const next = new Set(paths);
                  next.has(row.path) ? next.delete(row.path) : next.add(row.path);
                  return next;
                });
            }}
          >
            {row.dir && (
              <ChevronDown
                size={13}
                className={`secondary-skill-file-chevron ${collapsed.has(row.path) ? 'collapsed' : ''}`}
              />
            )}
            {row.dir ? (
              collapsed.has(row.path) ? (
                <Folder size={14} />
              ) : (
                <FolderOpen size={14} />
              )
            ) : (
              <FileText size={14} />
            )}
            <span>{row.path.split('/').at(-1)}</span>
            {diffStats.get(row.path)?.hasChanges && (
              <span
                className="secondary-skill-file-diff"
                aria-label={`+${diffStats.get(row.path).addedLines} -${diffStats.get(row.path).removedLines}`}
              >
                {diffStats.get(row.path).addedLines > 0 && (
                  <span className="added">+{diffStats.get(row.path).addedLines}</span>
                )}
                {diffStats.get(row.path).removedLines > 0 && (
                  <span className="removed">-{diffStats.get(row.path).removedLines}</span>
                )}
              </span>
            )}
            {row.path === 'SKILL.md' && (
              <small title={t.createSkillPrimaryFileTip}>{t.createSkillPrimaryFileTip}</small>
            )}
          </button>
          {!deletedPaths.has(row.path) && (
            <button
              className="secondary-skill-file-more"
              aria-label={`更多操作 ${row.path}`}
              aria-haspopup="menu"
              aria-expanded={context?.path === row.path}
              onClick={(event) => openContext(event, row)}
            >
              <MoreHorizontal size={12} />
            </button>
          )}
        </div>
        {row.dir && !collapsed.has(row.path) && tree(row.path, depth + 1)}
      </React.Fragment>
    ));
  }
  const editor = (
    <div className="secondary-skill-folder-editor">
      <aside onDragOver={(event) => dragOver(event, '')} onDrop={(event) => drop(event, '')}>
        <header>
          <span>{t.createSkillTreeTitle}</span>
          <button
            title={t.createSkillNewFolder}
            aria-label={t.createSkillNewFolder}
            onClick={() => startEntry(true)}
          >
            <FolderPlus size={13} />
          </button>
          <button
            title={t.createSkillNewMdFile}
            aria-label={t.createSkillNewMdFile}
            onClick={() => startEntry(false)}
          >
            <FilePlus2 size={13} />
          </button>
        </header>
        <div
          className={`secondary-skill-tree-root ${dropTarget === '' ? 'drop-target' : ''}`}
          aria-label="文件树根目录"
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null);
          }}
        >
          {tree()}
        </div>
        {treeError && (
          <p className="secondary-skill-tree-error" role="alert">
            {treeError}
          </p>
        )}
        {entry && (
          <div className="secondary-skill-entry">
            <input
              ref={entryInput}
              aria-label="名称"
              value={entry.name}
              placeholder={entry.dir ? '文件夹名称' : '文件名称.md'}
              onFocus={(event) => event.target.select()}
              onChange={(e) => setEntry({ ...entry, name: e.target.value, error: null })}
              onBlur={() => {
                if (!entry.name.trim()) {
                  completedEntry.current = entry;
                  setEntry(null);
                } else createEntry();
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  createEntry();
                }
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  e.preventDefault();
                  completedEntry.current = entry;
                  setEntry(null);
                }
              }}
            />
            {entry.rename && !entry.dir && <span>{entry.old.match(/\.[^./]+$/)?.[0]}</span>}
            <button onClick={createEntry}>
              <Check size={12} />
            </button>
            {entry.error && <small>{entry.error}</small>}
          </div>
        )}
        {context && (
          <SkillTreeMenu
            label="文件操作"
            x={context.x}
            y={context.y}
            onClose={() => setContext(null)}
            items={[
              {
                label: '重命名',
                disabled: context.path === 'SKILL.md',
                title: context.path === 'SKILL.md' ? t.createSkillPrimaryFileLocked : '',
                action: () => renameEntry(context),
              },
              {
                label: '删除',
                disabled: context.path === 'SKILL.md',
                action: () => setDeleteFile(context.path),
              },
            ]}
          />
        )}
      </aside>
      {file || deletedPaths.has(selected) ? (
        <div
          className={`secondary-skill-editor-pane ${error ? 'invalid' : ''}`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          {deletedPaths.has(selected) ? (
            <SkillMarkdownDiff
              original={onlineContents[selected]}
              modified=""
              emptyHint={t.createSkillDiffNoChanges}
            />
          ) : mode === 'code' || mode === 'diff' ? (
            <Suspense fallback={<div className="secondary-skill-file-empty">…</div>}>
              <SkillCodeEditor
                key={`${selected}:${generation}:${mode}`}
                ref={activeEditor}
                label={`${file.path} 内容`}
                value={file.content}
                placeholder={t.createSkillFileContentPlaceholder}
                onChange={setContent}
                position={positions.current.get(`${selected}:${mode}`)}
                onPositionChange={(position) =>
                  positions.current.set(`${selected}:${mode}`, position)
                }
                diffOriginal={mode === 'diff' ? onlineContents?.[selected] || '' : undefined}
              />
            </Suspense>
          ) : (
            <SkillRichEditor
              key={selected + generation + mode}
              ref={activeEditor}
              label={`${file.path} 内容`}
              value={file.content}
              onChange={setContent}
              placeholder={
                files.length === 1
                  ? t.createSkillContentPlaceholder
                  : t.createSkillFileContentPlaceholder
              }
              position={positions.current.get(`${selected}:${mode}`)}
              onPositionChange={(position) =>
                positions.current.set(`${selected}:${mode}`, position)
              }
            />
          )}
          <small className={focused || (file?.content.length || 0) > 20000 ? 'visible' : ''}>
            {file?.content.length || 0}/20000
          </small>
        </div>
      ) : (
        <p className="secondary-skill-file-empty">{t.createSkillSelectFileToEdit}</p>
      )}
    </div>
  );
  return (
    <div className="secondary-skill-content-field">
      <header>
        <span>
          {t.createSkillFieldContent} <b>*</b>
        </span>
        <div>
          {tools()}
          <button
            aria-label={t.skillExpand || '展开'}
            title={t.skillExpand || '展开'}
            onClick={() => fullscreen(true)}
          >
            <Maximize size={14} />
          </button>
        </div>
      </header>
      <input
        hidden
        type="file"
        aria-label="上传 Markdown 文件"
        ref={md}
        accept=".md,.markdown,text/markdown"
        onChange={(e) => upload(e, false)}
      />
      <input
        hidden
        type="file"
        ref={folder}
        aria-label="上传 Markdown 文件夹"
        multiple
        webkitdirectory=""
        onChange={(e) => upload(e, true)}
      />
      {!expanded && editor}
      {error && <small className="secondary-skill-error">{error}</small>}
      {optimizeError && (
        <p className="secondary-skill-optimize-error" role="alert">
          {optimizeError}
        </p>
      )}
      {expanded && (
        <Modal
          className="secondary-skill-expanded"
          closeButton={false}
          title={t.createSkillFieldContent}
          onClose={() => fullscreen(false)}
        >
          <header>
            <span>{t.createSkillFieldContent}</span>
            <div>
              {tools(true)}
              <button aria-label={t.createSkillCollapse} onClick={() => fullscreen(false)}>
                <Minimize size={14} />
              </button>
            </div>
          </header>
          {editor}
        </Modal>
      )}
      {replace && (
        <Modal
          className="small-modal"
          title={t.createSkillMergeConflictTitle}
          onClose={() => setReplace(null)}
        >
          <h2>{template(t.createSkillMergeConflictTitle, { files: replace.names })}</h2>
          <p>{template(t.createSkillMergeConflictMessage, { files: replace.names })}</p>
          <div className="modal-buttons">
            <button className="soft-button" onClick={() => setReplace(null)}>
              取消
            </button>
            <button
              className="white-button"
              onClick={() => {
                if (applyFiles(replace.next)) setReplace(null);
              }}
            >
              确认替换
            </button>
          </div>
        </Modal>
      )}
      {deleteFile && (
        <Modal
          className="small-modal"
          title={
            allDirs.includes(deleteFile)
              ? t.createSkillFolderDeleteTitle
              : t.createSkillFileDeleteTitle
          }
          onClose={() => setDeleteFile(null)}
        >
          <h2>
            {allDirs.includes(deleteFile)
              ? t.createSkillFolderDeleteTitle
              : t.createSkillFileDeleteTitle}
          </h2>
          <p>
            {template(
              allDirs.includes(deleteFile)
                ? t.createSkillFolderDeleteMessage
                : t.createSkillFileDeleteMessage,
              { name: deleteFile },
            )}
          </p>
          <div className="modal-buttons">
            <button className="soft-button" onClick={() => setDeleteFile(null)}>
              取消
            </button>
            <button className="white-button" onClick={removeEntry}>
              删除
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default SkillFileEditor;
