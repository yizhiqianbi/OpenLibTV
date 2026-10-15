import React from 'react';
import Icon from '../../../components/Icon.jsx';
import { folderPath } from '../../../services/asset-library/model.ts';

export default function AssetFolderTree({
  library,
  value,
  onChange,
  disabled = () => false,
  onCreate,
}) {
  const render = (parentId, depth = 0) =>
    library.folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => (
        <div className="asset-library-tree-node" key={folder.id}>
          <div className="asset-library-tree-row" style={{ paddingLeft: 12 + depth * 18 }}>
            <button
              className={value === folder.id ? 'active' : ''}
              disabled={disabled(folder.id)}
              onClick={() => onChange(folder.id)}
            >
              <Icon name="folder" />
              <span>{folder.name}</span>
            </button>
            {onCreate && folderPath(library, folder.id).length < 3 && (
              <button
                aria-label={`在 ${folder.name} 下新建文件夹`}
                onClick={() => onCreate(folder.id)}
              >
                <Icon name="add" size={14} />
              </button>
            )}
          </div>
          {depth < 3 && render(folder.id, depth + 1)}
        </div>
      ));
  return (
    <div className="asset-library-tree">
      <div className="asset-library-tree-row">
        <button
          className={value === null ? 'active' : ''}
          disabled={disabled(null)}
          onClick={() => onChange(null)}
        >
          <Icon name="folder" />
          个人素材库
        </button>
        {onCreate && (
          <button aria-label="新建根文件夹" onClick={() => onCreate(null)}>
            <Icon name="add" size={14} />
          </button>
        )}
      </div>
      {render(null)}
    </div>
  );
}
