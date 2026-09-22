/**
 * useCredentials —— 凭据服务 hooks
 */
import { useCallback } from "react";
import { useServices } from "./useServices.js";

/** 凭据管理的基础 hook */
export function useCredentials() {
  const { credentialService } = useServices();

  const load = useCallback((key: string) => credentialService.load(key), [credentialService]);
  const save = useCallback(
    (key: string, value: string) => credentialService.save(key, value),
    [credentialService],
  );
  const del = useCallback((key: string) => credentialService.delete(key), [credentialService]);

  return { load, save, delete: del };
}

/**
 * active provider access_token 专用便捷 hook。
 * 去平台化：OAuth 登录已删除，不再有 active provider 与 access_token；
 * 保留空实现以兼容既有导出面，getToken 恒为 null，写/删为 no-op。
 */
export function useAuthToken() {
  const getToken = useCallback(async () => null, []);
  const setToken = useCallback(async () => undefined, []);
  const clearToken = useCallback(async () => undefined, []);
  return { getToken, setToken, clearToken };
}
