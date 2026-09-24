import type { AppSettings, CustomModelRequestHeaderEntry } from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface ISettingService {
  get(): Promise<AppSettings>;
  update(
    patch: Partial<AppSettings>,
    expectedAccountSettings?: Pick<
      AppSettings,
      "providerFamilyDomain" | "providerFamilyConnectionSelections"
    >,
  ): Promise<void>;
  /** Change the data base directory: copy data from old → new location, then persist the setting. */
  updateDataBaseDir(newDir: string | undefined): Promise<void>;
  ensureDefaultProject(homedir: string): Promise<{ path: string; created: boolean }>;
  /**
   * 模型请求默认来源头的有序条目（specs/custom-request-headers.md「默认展示」）。
   * 只读、不落盘；取值与 agent 实际发送头同一份 shared 实现，供设置页预填编辑行。
   */
  getModelRequestHeaderDefaults(): Promise<CustomModelRequestHeaderEntry[]>;
}

export const ISettingService = createServiceDescriptor<ISettingService>(ServiceChannels.Setting);
