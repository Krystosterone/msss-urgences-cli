/** What `npm run build` records about the code it compiled (scripts/stamp-build.mjs). */
export interface BuildInfo {
  /** Short SHA of the last commit that changed code, i.e. anything outside archive/. */
  commit: string;
  /** True when tracked files outside archive/ differed from that commit at build time. */
  dirty: boolean;
}

/**
 * `0.1.0+a1b2c3d`, or `0.1.0+a1b2c3d.dirty` (semver build metadata). Without
 * build info (`npm run dev`, or a build made outside a git checkout) it's the
 * package version alone.
 */
export function formatVersion(pkgVersion: string, info: BuildInfo | undefined): string {
  if (info === undefined) return pkgVersion;
  return `${pkgVersion}+${info.commit}${info.dirty ? '.dirty' : ''}`;
}
