import type {
  ContentStore,
  DownloadedPackage,
  InstallableContent,
  LocalSearchEngine,
  LocalVersion,
} from "../types";
import { verifyPackageArchive, type ExpectedPackage } from "./verification";

export interface PackageInstallerOptions {
  readonly store: ContentStore;
  readonly search?: LocalSearchEngine;
  readonly now?: () => Date;
}

/** Verifies a downloaded archive and replaces the local copy of that version. */
export class PackageInstaller {
  private readonly store: ContentStore;
  private readonly search: LocalSearchEngine | undefined;
  private readonly now: () => Date;

  constructor(options: PackageInstallerOptions) {
    this.store = options.store;
    this.search = options.search;
    this.now = options.now ?? (() => new Date());
  }

  async install(download: DownloadedPackage): Promise<LocalVersion> {
    return this.installArchive(download.archive, {
      versionId: download.versionId,
      versionCode: download.versionCode,
      checksum: download.checksum,
    });
  }

  async installArchive(archive: Uint8Array, expected: ExpectedPackage): Promise<LocalVersion> {
    const verified = verifyPackageArchive(archive, expected);
    const installed: InstallableContent = {
      manifest: verified.manifest,
      manifest_sha256: verified.manifest_sha256,
      versification: verified.versification,
      verses: verified.verses,
      archive_bytes: archive.byteLength,
      installed_at: this.now().toISOString(),
    };
    await this.store.installContent(installed);
    if (this.search) {
      await this.search.indexVersion(verified.manifest.versionId);
      await this.store.markSearchReady(verified.manifest.versionId, true);
    }
    const version = await this.store.getVersion(verified.manifest.versionId);
    if (!version)
      throw new Error("The installed version could not be read back from local storage");
    return version;
  }
}
