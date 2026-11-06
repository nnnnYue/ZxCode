import type {
  ConnectionProfile,
  RemoteAssetInstallMode,
  RemoteTarget,
  SourceServerManagementSnapshot,
} from "@zcode/shared";
import { isValidWslUser, normalizeRemoteResourcePackageSelection } from "@zcode/shared";
import type { SSHAuthMethod } from "@/hooks/useRemoteConnectionForm.js";
import type { RemoteWizardStep } from "@/RemoteConnectionWizardChrome.js";

type WizardIntlLike = {
  formatMessage: (descriptor: { id: string }, values?: Record<string, string>) => string;
};

export interface RemoteConnectionFormSnapshot {
  kind: RemoteTarget["kind"];
  host: string;
  port: string;
  username: string;
  sshAuthMethod: SSHAuthMethod;
  assetInstallMode?: RemoteAssetInstallMode;
  selectedSshConfigAlias?: string | null;
  password: string;
  privateKeyPath: string;
  privateKeyPassphrase: string;
  wslDistro: string;
  wslUser?: string;
  dockerContainer: string;
  manualDockerContainer?: string;
  serverUrl?: string;
  serverName?: string;
  serverToken?: string;
  serverWorkspacePath?: string;
}

export function getRemoteWizardStepCopy(
  intl: WizardIntlLike,
  step: RemoteWizardStep,
  kind: RemoteTarget["kind"],
) {
  switch (step) {
    case "kind":
      return {
        title: intl.formatMessage({ id: "remote.kindStepTitle" }),
        description: intl.formatMessage({ id: "remote.kindStepDescription" }),
      };
    case "settings":
      return {
        title: intl.formatMessage({ id: "remote.settingsStepTitle" }),
        description: intl.formatMessage(
          { id: "remote.settingsStepDescription" },
          {
            method: intl.formatMessage({ id: `remote.kind.${kind}` }),
          },
        ),
      };
    case "connecting":
      return {
        title: intl.formatMessage({ id: "remote.connectingStepTitle" }),
        description: intl.formatMessage(
          { id: "remote.connectingStepDescription" },
          {
            method: intl.formatMessage({ id: `remote.kind.${kind}` }),
          },
        ),
      };
    case "directory":
      return {
        title: intl.formatMessage({ id: "remote.selectDirectoryTitle" }),
        description: intl.formatMessage({ id: "remote.selectDirectoryDescription" }),
      };
  }
}

export function buildRemoteTarget(
  intl: WizardIntlLike,
  snapshot: RemoteConnectionFormSnapshot,
): { target?: RemoteTarget; errorMessage?: string } {
  switch (snapshot.kind) {
    case "ssh":
      if (!snapshot.host || !snapshot.username) {
        return {
          errorMessage: intl.formatMessage({ id: "ssh.validation.required" }),
        };
      }

      if (snapshot.sshAuthMethod === "password" && !snapshot.password) {
        return {
          errorMessage: intl.formatMessage({ id: "ssh.validation.passwordRequired" }),
        };
      }

      if (snapshot.sshAuthMethod === "privateKey" && !snapshot.privateKeyPath) {
        return {
          errorMessage: intl.formatMessage({ id: "ssh.validation.privateKeyRequired" }),
        };
      }

      const sshConfigAlias = snapshot.selectedSshConfigAlias?.trim();

      return {
        target: {
          kind: "ssh",
          host: snapshot.host,
          port: snapshot.port ? Number(snapshot.port) : undefined,
          username: snapshot.username,
          ...(sshConfigAlias ? { sshConfigAlias } : {}),
          assetInstallMode: snapshot.assetInstallMode,
          ...(snapshot.sshAuthMethod === "password" && snapshot.password
            ? { password: snapshot.password }
            : {}),
          ...(snapshot.sshAuthMethod === "privateKey" && snapshot.privateKeyPath
            ? { privateKeyPath: snapshot.privateKeyPath }
            : {}),
          ...(snapshot.sshAuthMethod === "privateKey" && snapshot.privateKeyPassphrase
            ? { privateKeyPassphrase: snapshot.privateKeyPassphrase }
            : {}),
        },
      };
    case "docker":
      // Docker 运行中列表可能因为探测失败或刷新延迟不完整。
      // 手动输入必须独立于下拉选择，提交时优先使用手动输入，空值再回落到下拉选择。
      const dockerContainer =
        snapshot.manualDockerContainer?.trim() || snapshot.dockerContainer.trim();

      if (!dockerContainer) {
        return {
          errorMessage: intl.formatMessage({ id: "docker.validation.required" }),
        };
      }

      return {
        target: {
          kind: "docker",
          container: dockerContainer,
        },
      };
    case "wsl": {
      const wslUser = snapshot.wslUser?.trim();
      if (wslUser && !isValidWslUser(wslUser)) {
        return {
          errorMessage: intl.formatMessage({ id: "wsl.validation.invalidUser" }),
        };
      }
      return {
        target: {
          kind: "wsl",
          distro: snapshot.wslDistro || undefined,
          ...(wslUser ? { user: wslUser } : {}),
        },
      };
    }
    case "server": {
      const url = snapshot.serverUrl?.trim() ?? "";
      if (!url) {
        return {
          errorMessage: intl.formatMessage({ id: "server.validation.urlRequired" }),
        };
      }

      try {
        new URL(url);
      } catch {
        return {
          errorMessage: intl.formatMessage({ id: "server.validation.invalidUrl" }),
        };
      }

      const name = snapshot.serverName?.trim();
      const token = snapshot.serverToken?.trim();
      const workspacePath = snapshot.serverWorkspacePath?.trim();

      return {
        target: {
          kind: "server",
          url,
          ...(name ? { name } : {}),
          ...(token ? { token } : {}),
          ...(workspacePath ? { workspacePath } : {}),
        },
      };
    }
  }
}

export function withDefaultRemoteResourcePackages(target: RemoteTarget): RemoteTarget {
  if (target.kind !== "ssh") {
    return target;
  }

  return {
    ...target,
    resourcePackages: {
      // 当前分支只保留一个 ZxCode Agent，SSH 向导再让用户手动挑资源包会产生无意义分叉。
      // 这里统一走默认 active 资源集，历史重连传入的旧选择不再影响部署范围。
      selectedPackageIds: normalizeRemoteResourcePackageSelection(),
    },
  };
}

/** Profile 落地为非 server 连接目标；凭据不入 target，连接时由凭据层补充。 */
export function buildRemoteTargetFromProfile(
  profile: ConnectionProfile,
): Exclude<RemoteTarget, { kind: "server" }> {
  switch (profile.target.kind) {
    case "ssh":
      return {
        kind: "ssh",
        host: profile.target.host,
        ...(profile.target.port ? { port: profile.target.port } : {}),
        username: profile.target.username,
        ...(profile.target.sshConfigAlias ? { sshConfigAlias: profile.target.sshConfigAlias } : {}),
        ...(profile.target.privateKeyPath ? { privateKeyPath: profile.target.privateKeyPath } : {}),
        ...(profile.target.assetInstallMode
          ? { assetInstallMode: profile.target.assetInstallMode }
          : {}),
      };
    case "wsl":
      return {
        kind: "wsl",
        ...(profile.target.distro ? { distro: profile.target.distro } : {}),
        ...(profile.target.user ? { user: profile.target.user } : {}),
      };
    case "docker":
      return { kind: "docker", container: profile.target.container };
  }
}

/** 设备聚合与请求线路同源：优先设备声明的 preferredProfileId，否则取首个未退役 Profile。 */
export function findPreferredSourceConnectionProfile(
  snapshot: Pick<SourceServerManagementSnapshot, "servers" | "profiles">,
  sourceServerId: string,
): ConnectionProfile | undefined {
  const server = snapshot.servers.find((candidate) => candidate.sourceServerId === sourceServerId);
  if (!server) return undefined;

  const activeProfiles = snapshot.profiles.filter(
    (profile) => profile.sourceServerId === sourceServerId && profile.lifecycleState !== "retired",
  );
  return (
    activeProfiles.find((profile) => profile.profileId === server.preferredProfileId) ??
    activeProfiles[0]
  );
}
