import { resolveModelProviderFamilySpecByProviderId } from "@zcode/shared";
import type { ReactNode } from "react";
import { ProviderLogo } from "./ProviderLogo.js";
import { resolveModelProviderNavLogo } from "@/settings/model-provider-section/utils.js";
import type { ModelProviderNavItem } from "./constants.js";

export function ProviderFamilyDetailShell({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  if (!header) {
    return children;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {header}
      {children}
    </div>
  );
}

export function ProviderFamilyHeader({
  selectedNavItem,
  trailingAction,
}: {
  selectedNavItem: ModelProviderNavItem | null;
  trailingAction?: ReactNode;
}) {
  if (!selectedNavItem) {
    return null;
  }

  const providerId =
    selectedNavItem.type === "preset" ||
    selectedNavItem.type === "codingPlan" ||
    selectedNavItem.type === "teamPlan"
      ? selectedNavItem.presetId
      : null;
  if (!providerId) {
    return null;
  }

  const familySpec = resolveModelProviderFamilySpecByProviderId(providerId);
  if (!familySpec) {
    return null;
  }

  return (
    <div className="flex h-8 min-w-0 flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ProviderLogo logo={resolveModelProviderNavLogo(selectedNavItem)} className="size-5" />
        <h3 className="truncate text-ui-lg font-medium text-foreground">{familySpec.label}</h3>
      </div>
      {/* 按团队全称的固有宽度参与外层换行，会让标题右侧空着却整组掉行；以操作区基础宽度参与分配，再让名称在剩余空间内收缩。*/}
      {trailingAction ? (
        <div className="min-w-0 max-w-full flex-1 basis-64">{trailingAction}</div>
      ) : null}
    </div>
  );
}
