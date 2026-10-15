/** Original 417754 collectIncomingNodeData. Certification in place does not erase an input certificate. */
export function roleMediaReferenceMetadata(node, kind = node?.data?.type || node?.type) {
  const data = node?.data || {};
  let assetId, exempt, checkedAt;
  if (kind === 'image') {
    assetId = data.portraitAssetId;
    exempt = !assetId && !!data.portraitCompliantExempt;
    checkedAt = data.portraitComplianceCheckedAtMs;
  } else if (kind === 'video') {
    assetId = data.assetVideoAssetId ?? data.portraitAssetId;
    exempt = !assetId && !!data.assetVideoCompliantExempt;
    checkedAt = data.assetVideoComplianceCheckedAtMs;
  } else if (kind === 'audio') {
    assetId = data.assetAudioAssetId ?? data.portraitAssetId;
  }
  if (!assetId && !exempt) return {};
  return {
    ...(assetId ? { assetId } : { compliantExempt: true }),
    ...(kind !== 'audio'
      ? {
          ...(checkedAt !== undefined ? { complianceCheckedAtMs: checkedAt } : {}),
          ...(node.createdAtMs !== undefined ? { sourceCreatedAtMs: node.createdAtMs } : {}),
          ...(node.createdAtMsIsLocalPlaceholder !== undefined
            ? { sourceCreatedAtMsIsLocalPlaceholder: node.createdAtMsIsLocalPlaceholder }
            : {}),
        }
      : {}),
  };
}
