import { parentPort, workerData } from "node:worker_threads";
import { z } from "zod";
import { prepareTasksIndexStorage } from "@zcode/services/storage-startup";
import {
  classifyDatabaseStartupError,
  databaseStartupErrorDetails,
  databaseMigrationFactsSchema,
} from "@zcode/shared";

const data = z
  .object({ path: z.string().min(1), settings: z.unknown().optional() })
  .strict()
  .parse(workerData);
try {
  await prepareTasksIndexStorage(
    data.path,
    (phase, migration) => parentPort?.postMessage({ type: "progress", phase, migration }),
    // fork：settings 由 Host 传入（源为 settingService.get()），0005 项目集合迁移唯一消费点。
    data.settings as Parameters<typeof prepareTasksIndexStorage>[2] | undefined,
  );
  parentPort?.postMessage({ type: "done" });
} catch (error) {
  const migration = databaseMigrationFactsSchema.safeParse(
    error && typeof error === "object"
      ? (error as { startupMigration?: unknown }).startupMigration
      : undefined,
  );
  parentPort?.postMessage({
    type: "failed",
    migration: migration.success ? migration.data : undefined,
    errorCode: classifyDatabaseStartupError(error),
    ...databaseStartupErrorDetails(error),
  });
} finally {
  parentPort?.close();
}
