import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelConfigRules, parsePersonalProviderConfigMap } from "@zcode/provider";
import {
  NodePersonalProviderConfigRepository,
  encodeProviderConfigFile,
} from "@zcode/provider-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCredentialCipherProvider } from "../src/credential/providers/credentialCipherProvider.js";
import {
  listProviderProvisioningCredentialKeys,
  createProviderProvisioningSource,
} from "../src/model-provider/providerProvisioningSource.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function personalRepository(root: string) {
  const repo = new NodePersonalProviderConfigRepository({
    filePath: join(root, "provider_config.json"),
    pollingIntervalMs: false,
  });
  cleanups.push(async () => {
    repo.dispose();
    await rm(root, { recursive: true, force: true });
  });
  return repo;
}

describe("Provider Provisioning Source", () => {
  it("exports sparse Personal Config, default and account settings; 去平台化后不再导出 oauth 凭据", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-provider-provisioning-source-"));
    const credentialsPath = join(root, "credentials.json");
    const cipher = createCredentialCipherProvider({ env: { ZXCODE_CREDENTIAL_SECRET: "source" } });
    await writeFile(
      credentialsPath,
      JSON.stringify({
        // fork：OAuth 登录剔除后 allowlist 为空，残留的历史 oauth 凭据不被导出同步。
        "oauth:active_provider": cipher.encrypt("zai"),
        "oauth:zai:access_token": cipher.encrypt("oauth-token"),
        "ssh:password": cipher.encrypt("must-not-export"),
        "ssh:malformed": { unexpected: true },
      }),
      "utf8",
    );
    const repository = personalRepository(root);
    await repository.update(() => ({
      providers: parsePersonalProviderConfigMap({
        providerRules: [
          {
            providerId: "custom",
            config: {
              group: "standard-personal",
              access: { type: "api-key", apiKey: "provider-key" },
              api: { type: "openai-chat-completions", baseUrl: "https://example.com/v1" },
              personalModelIds: ["model-a"],
            },
          },
        ],
      }),
      models: ModelConfigRules.empty(),
      providerOrder: ["custom"],
      defaultModelSelection: { providerId: "custom", modelId: "model-a" },
    }));
    const source = createProviderProvisioningSource({
      personalRepository: repository,
      settingService: {
        get: vi.fn(async () => ({
          providerFamilyDomain: "zai",
          providerFamilyConnectionSelections: { zai: { kind: "individual-coding-plan" } },
        })),
      } as never,
      credentialFilePath: credentialsPath,
      personalConfigFilePath: join(root, "provider_config.json"),
      cipherProvider: cipher,
    });

    const snapshot = await source.read("sync-source");
    expect(await listProviderProvisioningCredentialKeys(credentialsPath)).toEqual([]);
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.personalConfig).toEqual(
      encodeProviderConfigFile(await repository.read()).config,
    );
    expect(snapshot.personalConfig.defaultModelSelection).toEqual({
      providerId: "custom",
      modelId: "model-a",
    });
    expect(snapshot.credentials).toEqual([]);
    expect(snapshot.credentials.some((entry) => entry.key === "ssh:password")).toBe(false);
    expect(snapshot.credentials.some((entry) => entry.key.endsWith(":identity"))).toBe(false);
    expect(snapshot).not.toHaveProperty("sourceRevision");
    repository.dispose();
  });

  it("does not let malformed non-allowlist credential records block sync", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-provider-provisioning-source-"));
    const credentialsPath = join(root, "credentials.json");
    const cipher = createCredentialCipherProvider({ env: { ZXCODE_CREDENTIAL_SECRET: "source" } });
    await writeFile(
      credentialsPath,
      JSON.stringify({
        "oauth:active_provider": cipher.encrypt("zai"),
        "ssh:malformed": { unexpected: true },
        "account-provider:coding-plan:legacy:account:user:api-key": "enc:v1:broken",
        "account-provider:coding-plan:malformed:account:user:api-key": { invalid: true },
      }),
      "utf8",
    );
    const source = createProviderProvisioningSource({
      personalRepository: personalRepository(root),
      settingService: { get: vi.fn(async () => ({})) } as never,
      credentialFilePath: credentialsPath,
      personalConfigFilePath: join(root, "provider_config.json"),
      cipherProvider: cipher,
    });

    // fork：allowlist 为空，历史 malformed 记录一律不在同步面内，read 正常完成。
    await expect(source.read("sync-malformed-unrelated")).resolves.toMatchObject({
      credentials: [],
    });
  });

  // fork 已剔除 oauth-session 凭据 allowlist（PROVIDER_PROVISIONING_OAUTH_CREDENTIAL_KEYS 为空），
  // 上游「malformed allowlist 记录必须让 read 失败」的用例不再有输入面，随之删除。
});
