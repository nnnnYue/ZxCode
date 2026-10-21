// fork：off-peak 域已剔除；stub 满足导入合同。
export function createProtocolOffPeakPort(..._args: unknown[]): never {
  throw new Error("off-peak: removed in community edition");
}
// 供类型引用
export interface OffPeakPort { readonly _removed: true }
