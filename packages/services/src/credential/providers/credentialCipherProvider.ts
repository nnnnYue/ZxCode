// fork：上游 v3.18.0 将本地 AES-GCM 实现收敛到 shared/credential-security 的 legacy cipher；
// fork 原「空 cipherText 第三段合法」的修复已包含在 createLegacyCredentialCipher 的
// parts.length===3 + base64url（允许空段）判定中，故整体切换为委托实现，保留同名导出兼容。
import {
  createLegacyCredentialCipher,
  type CredentialCipher,
} from "@zcode/shared/credential-security";
export type CredentialCipherProvider = CredentialCipher;
/** 旧格式仅用于历史导入或显式 fixture，默认服务使用系统安全存储。 */
export function createCredentialCipherProvider(options: { env?: NodeJS.ProcessEnv } = {}) {
  return createLegacyCredentialCipher(options.env);
}
