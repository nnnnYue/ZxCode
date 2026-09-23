import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Switch } from "@/components/ui/switch.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
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
 * 保存后经 useSettings().update 落盘并刷新快照。改动经 spawn env 下发，重启 Agent 后生效。
 */
export function CustomSection() {
  const { intl } = useZCodeIntl();
  const { settings, update } = useSettings();
  const storedEnabled = settings?.customModelRequestHeadersEnabled === true;
  const storedRows = settings?.customModelRequestHeaders ?? [];
  const [rows, setRows] = useState<HeaderRowDraft[]>(() =>
    storedRows.map((entry) => ({ name: entry.name, value: entry.value })),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 草稿只在「未编辑」时跟随落盘值，避免别处（其它窗口/远端）刷新覆盖正在编辑的内容。
  useEffect(() => {
    if (dirty) {
      return;
    }
    setRows(storedRows.map((entry) => ({ name: entry.name, value: entry.value })));
  }, [dirty, storedRows]);

  const handleRowsChange = useCallback((nextRows: HeaderRowDraft[]) => {
    setRows(nextRows);
    setDirty(true);
  }, []);

  const handleToggle = useCallback(
    async (checked: boolean) => {
      // 首次开启且没有任何已存条目时，给一行空行降低上手成本；不算脏、不自动落盘。
      if (checked && rows.length === 0) {
        setRows([{ name: "", value: "" }]);
        setDirty(false);
      }
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
    [rows.length, update],
  );

  const entries = toHeaderEntries(rows);
  const canSave = entries !== undefined && dirty;
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
          await update({ customModelRequestHeaders: entries });
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
  }, [entries, intl, update]);

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
