/**
 * useServices —— 通过 React Context 提供 IServiceAccessor
 *
 * 替代 props drilling，组件通过 useServices() 直接获取服务。
 */
import { createContext, useContext, type ReactNode } from "react";
import type { IServiceAccessor } from "@zcode/services";

const ServiceContext = createContext<IServiceAccessor | null>(null);

// 侧栏换骨架 Phase 3c：对齐上游 composer 客户端命名空间 context。
// 手机同源可连接多台桌面；稳定设备身份不能用临时 bridge ID 替代。
const ComposerClientNamespaceContext = createContext<string>("");

/** 手机同源可连接多台桌面；稳定设备身份不能用临时 bridge ID 替代。 */
export function useComposerClientNamespace(): string {
  return useContext(ComposerClientNamespaceContext);
}

export function useTerminalOwnerId(): string | undefined {
  return useContext(TerminalOwnerContext);
}

const TerminalOwnerContext = createContext<string | undefined>(undefined);

export function ServiceProvider({
  services,
  children,
  composerClientNamespace,
  terminalOwnerId,
}: {
  services: IServiceAccessor;
  children: ReactNode;
  composerClientNamespace?: string;
  terminalOwnerId?: string;
}) {
  const inheritedNamespace = useComposerClientNamespace();
  const inheritedTerminalOwner = useTerminalOwnerId();
  return (
    <ComposerClientNamespaceContext.Provider value={composerClientNamespace ?? inheritedNamespace}>
      <TerminalOwnerContext.Provider value={terminalOwnerId ?? inheritedTerminalOwner}>
        <ServiceContext.Provider value={services}>{children}</ServiceContext.Provider>
      </TerminalOwnerContext.Provider>
    </ComposerClientNamespaceContext.Provider>
  );
}

export function useServices(): IServiceAccessor {
  const ctx = useContext(ServiceContext);
  if (!ctx) {
    throw new Error("useServices 必须在 ServiceProvider 内使用");
  }
  return ctx;
}

export function useOptionalServices(): IServiceAccessor | null {
  return useContext(ServiceContext);
}
