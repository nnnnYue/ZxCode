// fork：provider-runtime-headers 已随 request-security 域剔除；stub 满足导入合同。
export function createProviderRuntimeHeadersPort(..._args: unknown[]): never {
  throw new Error("provider-runtime-headers: removed in community edition");
}
export interface ProviderRuntimeHeadersPort { readonly _removed: true }
