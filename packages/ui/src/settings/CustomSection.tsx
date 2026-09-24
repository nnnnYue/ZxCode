import { useCallback, useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import {
  diffCustomModelRequestHeadersAgainstDefaults,
  mergeCustomModelRequestHeaderRows,
} from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Switch } from "@/components/ui/switch.js";
import { toast } from "@/components/ui/toast.js";
import { logger } from "@/logger.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useServices } from "@/hooks/useServices.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { runUserActionAsync } from "@/lib/userActionTelemetry.js";
import {
  CustomRequestHeadersEditor,
  toHeaderEntries,
  type HeaderRowDraft,
} from "@/settings/CustomRequestHeadersEditor.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";

/**
 * 设置-基础设置-自定义（specs/custom-request-headers.md）。
 * 状态所有者是 AppSettings（settingService 单一写入路径）；这里的 rows 只是未提交草稿，
 * 保存后经 useSettings().update 落盘并刷新快照。
 * 开启后预填 host 下发的默认来源头（getModelRequestHeaderDefaults，与 agent 实际发送同一实现），
 * 保存时差量捕获：与默认值相同的行不落盘，只保留同名覆盖与新增条目；改动经 spawn env 下发，
 * 重新加载会话（restartWorkspaceProcess）或重启应用后生效。
 */
export function CustomSection() {
  const { intl } = useZCodeIntl();
  const { settings, update } = useSettings();
  const { settingService } = useServices();
  const storedEnabled = settings?.customModelRequestHeadersEnabled === true;
  // storedRows 必须引用稳定：老配置里 customModelRequestHeaders 字段缺失（undefined）时，
  // 若在渲染期写 `?? []`，每轮渲染都会生成新数组并作为下方 useEffect 的依赖，
  // 导致 effect 反复 setRows 触发无限重渲染（React error #185）。
  // 修复依据：以 settings 快照为唯一依赖做 useMemo，仅在快照变化时重建派生数组。
  const storedRows = useMemo(() => settings?.customModelRequestHeaders ?? [], [settings]);
  const [rows, setRows] = useState<HeaderRowDraft[]>(() =>
    storedRows.map((entry) => ({ name: entry.name, value: entry.value })),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // 默认来源头（name → value，键序即展示序）：null = 尚未加载；{} = 读取失败降级态
  //（此时编辑器退回旧形态，仅展示已存覆盖条目）。
  const [defaultHeaders, setDefaultHeaders] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    settingService
      .getModelRequestHeaderDefaults()
      .then((entries) => {
        if (cancelled) return;
        setDefaultHeaders(Object.fromEntries(entries.map((entry) => [entry.name, entry.value])));
      })
      .catch((error) => {
        // 默认值只是展示辅助；读取失败不阻断编辑与保存，降级为仅展示已存覆盖条目。
        logger.warn("加载模型请求默认头失败，自定义请求头编辑器降级为仅展示已存覆盖条目", error);
        if (!cancelled) {
          setDefaultHeaders({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [settingService]);

  // 草稿只在「未编辑」时跟随落盘值 + 默认头预填，避免别处（其它窗口/远端）刷新覆盖正在编辑的内容。
  useEffect(() => {
    if (dirty) {
      return;
    }
    if (defaultHeaders === null) {
      setRows(storedRows.map((entry) => ({ name: entry.name, value: entry.value })));
      return;
    }
    setRows(mergeCustomModelRequestHeaderRows(defaultHeaders, storedRows));
  }, [dirty, storedRows, defaultHeaders]);

  const handleRowsChange = useCallback((nextRows: HeaderRowDraft[]) => {
    setRows(nextRows);
    setDirty(true);
  }, []);

  const handleToggle = useCallback(
    async (checked: boolean) => {
      await runUserActionAsync({
        input: {
          featureId: "settings.custom",
          action: "toggle_custom_model_headers",
          trigger: "switch",
        },
        operation: () => update({ customModelRequestHeadersEnabled: checked }),
        completed: {
          resultSource: "setting_service",
          stateAfter: checked ? "enabled" : "disabled",
          requiresRestart: true,
        },
        failureStage: "settings_commit",
      });
    },
    [update],
  );

  const entries = toHeaderEntries(rows);
  const canSave = entries !== undefined && dirty;
  const showDefaultsHint = Boolean(defaultHeaders && Object.keys(defaultHeaders).length > 0);
  const handleSave = useCallback(async () => {
    if (!entries) {
      return;
    }
    setSaving(true);
    try {
      await runUserActionAsync({
        input: {
          featureId: "settings.custom",
          action: "save_custom_model_headers",
          trigger: "button",
        },
        operation: async () => {
          // 差量捕获（specs/custom-request-headers.md「差量捕获」）：与默认值相同的行不落盘，
          // 避免把版本号 / origin 钉死在配置里；默认值读取失败时全部行按覆盖落盘（旧语义）。
          const nextEntries = defaultHeaders
            ? diffCustomModelRequestHeadersAgainstDefaults(defaultHeaders, entries)
            : entries;
          await update({ customModelRequestHeaders: nextEntries });
          setDirty(false);
        },
        completed: {
          resultSource: "setting_service",
          configured: entries.length > 0,
          requiresRestart: true,
        },
        failureStage: "settings_commit",
      });
      toast(intl.formatMessage({ id: "settings.custom.headers.saved" }));
    } catch {
      toast(intl.formatMessage({ id: "settings.custom.headers.saveFailed" }));
    } finally {
      setSaving(false);
    }
  }, [entries, defaultHeaders, intl, update]);

  return (
    <div className="space-y-3">
      <div className="text-ui-base font-medium text-foreground-subtle">
        {intl.formatMessage({ id: "settings.custom.description" })}
      </div>
      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.custom.headers.title" })}
          description={intl.formatMessage({ id: "settings.custom.headers.description" })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.custom.headers.title" })}
              checked={storedEnabled}
              data-testid="settings-custom-headers-switch"
              onCheckedChange={(checked) => void handleToggle(checked)}
            />
          }
        />
        {storedEnabled ? (
          <div className="space-y-3 border-t border-border px-4 py-3">
            {showDefaultsHint ? (
              <p className="text-ui-sm text-foreground-subtle">
                {intl.formatMessage({ id: "settings.custom.headers.defaultsHint" })}
              </p>
            ) : null}
            <CustomRequestHeadersEditor rows={rows} onRowsChange={handleRowsChange} />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={!canSave || saving}
                onClick={() => void handleSave()}
                data-testid="settings-custom-headers-save"
              >
                <Save className="size-4" />
                {intl.formatMessage({ id: "settings.custom.headers.save" })}
              </Button>
              <span className="text-ui-base text-foreground-subtle">
                {intl.formatMessage({ id: "settings.custom.headers.restartHint" })}
              </span>
            </div>
          </div>
        ) : null}
      </SettingsGroupCard>
    </div>
  );
}
