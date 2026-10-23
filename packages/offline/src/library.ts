import type { PackageInstaller } from "./download/installer";
import type { DownloadManager } from "./download/manager";
import type { ContentStore, LocalSearchEngine, LocalVersion } from "./types";

export interface OfflineLibraryOptions {
  readonly store: ContentStore;
  readonly search: LocalSearchEngine;
  readonly downloads: DownloadManager;
  readonly installer: PackageInstaller;
}

/**
 * Coordinates download, verification, installation and indexing. The returned
 * version is only visible to readers after every checksum and the search index
 * have succeeded.
 */
export class OfflineLibrary {
  private readonly store: ContentStore;
  private readonly search: LocalSearchEngine;
  private readonly downloads: DownloadManager;
  private readonly installer: PackageInstaller;

  constructor(options: OfflineLibraryOptions) {
    this.store = options.store;
    this.search = options.search;
    this.downloads = options.downloads;
    this.installer = options.installer;
  }

  async installVersion(versionId: string): Promise<LocalVersion> {
    const downloaded = await this.downloads.download(versionId);
    const version = await this.installer.install(downloaded);
    await this.downloads.clear(versionId);
    return version;
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.store.deleteVersion(versionId);
    await this.search.deleteVersion(versionId);
    await this.downloads.clear(versionId);
  }

  async pauseDownload(versionId: string): Promise<void> {
    await this.downloads.pause(versionId);
  }
}
