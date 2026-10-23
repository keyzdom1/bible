import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { MobileRuntime } from "./mobile-runtime";

export const BACKGROUND_SYNC_TASK = "holyword-background-sync";

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const runtime = new MobileRuntime();
  try {
    await runtime.initialize();
    const session = await runtime.restoreSession();
    if (!session) return BackgroundFetch.BackgroundFetchResult.NoData;
    await runtime.syncNow();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  } finally {
    await runtime.close().catch(() => undefined);
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return;
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (registered) return;
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Background execution is best-effort; foreground sync remains active.
  }
}
