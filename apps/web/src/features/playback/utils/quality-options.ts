/** Keep original hls.js level indexes even when presenting options sorted by resolution. */
export type QualityOption = { index: number; label: string };
export type VideoQualityLevel = { height?: number; bitrate?: number };

export function buildQualityOptions(levels: readonly VideoQualityLevel[]): QualityOption[] {
  const baseLabels = levels.map((level, index) => {
    const height = level.height ?? 0;
    const kbps = Math.round((level.bitrate ?? 0) / 1000);
    if (Number.isFinite(height) && height > 0) return `${Math.round(height)}p`;
    return Number.isFinite(kbps) && kbps > 0 ? `${kbps} kbps` : `Profil ${index + 1}`;
  });

  return levels
    .map((level, index) => {
      const base = baseLabels[index] ?? `Profil ${index + 1}`;
      const duplicates = baseLabels.filter((label) => label === base).length > 1;
      const kbps = Math.round((level.bitrate ?? 0) / 1000);
      const label =
        duplicates && Number.isFinite(kbps) && kbps > 0 ? `${base} (${kbps} kbps)` : base;
      return { index, label };
    })
    .sort((a, b) => {
      const heightA = levels[a.index]?.height ?? 0;
      const heightB = levels[b.index]?.height ?? 0;
      if (heightA !== heightB) return heightB - heightA;
      return (levels[b.index]?.bitrate ?? 0) - (levels[a.index]?.bitrate ?? 0);
    });
}

/** -1 restores adaptive selection; invalid/manual-out-of-range values are ignored. */
export function applyQualitySelection(
  hls: { nextLevel: number } | null,
  options: readonly QualityOption[],
  selected: number,
): boolean {
  if (!hls || (selected !== -1 && !options.some((option) => option.index === selected))) {
    return false;
  }
  hls.nextLevel = selected;
  return true;
}
