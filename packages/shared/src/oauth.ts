/**
 * 凭据解密错误标识
 *
 * 说明：敏感信息（如 appSecret）只允许放在 services 的 provider 模块中，不能放 shared 层。
 * 原 Z.AI/BigModel OAuth 登录类型已随去平台化清理删除。
 */

/** 凭据解密失败错误前缀 */
export const CREDENTIAL_DECRYPT_ERROR_PREFIX = "凭据解密失败：" as const;

/** 凭据解密失败稳定错误码 */
export const CREDENTIAL_DECRYPT_ERROR_CODE = "ZXCODE_CREDENTIAL_DECRYPT_FAILED" as const;
