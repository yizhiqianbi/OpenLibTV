const labels = {
  self: '不能连接节点自身',
  duplicate: '节点之间已有连接',
  cycle: '连接会形成循环',
  limit: '已达到参考素材数量上限',
  clipLimit: '已达到智能剪辑的视频数量上限',
  uploadRequired: '请先上传素材再连接',
  modelsUnavailable: '模型配置尚未加载，暂时无法连接',
  capacityUnavailable: '模型的参考数量配置尚不可用',
  modelUnsupported: '当前可用模型不支持这组参考素材',
  missingNode: '节点已不存在',
  singleInput: '此节点只能连接一个输入',
  lockedModelUnsupported: '当前节点的模型已锁定，不支持这组素材',
  modelCatalogueUnavailable: '模型目录尚不可用，请稍后重试',
  referenceTarget: '引用节点只能接入另一个引用节点',
  scriptVideo: '脚本节点不支持视频输入',
  emptyGroup: '分组内暂无可用素材',
};
export const canvasConnectionReasonLabel = (reason) => labels[reason] || '不支持此节点组合';
