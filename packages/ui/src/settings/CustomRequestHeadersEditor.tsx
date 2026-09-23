import { Plus, Trash2 } from "lucide-react";
import type { CustomModelRequestHeaderEntry } from "@zcode/shared";
import {
  CUSTOM_MODEL_REQUEST_HEADERS_MAX_ENTRIES,
  isValidModelRequestHeaderName,
  isValidModelRequestHeaderValue,
} from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** 编辑器行的草稿形态：允许临时留空，保存前经 validateHeaderRows 把关。 */
export interface HeaderRowDraft {
  name: string;
  value: string;
}

export interface HeaderRowIssue {
  /** name 非法（不是 HTTP token）；duplicate 与其它行大小写不敏感重名。 */
  name?: "invalid" | "duplicate";
  value?: "invalid";
  /** 名称/值只填了一半的半行。 */
  incomplete?: boolean;
}

function normalizedRowIssue(row: HeaderRowDraft): HeaderRowIssue {
  const name = row.name.trim();
  const value = row.value.trim();
  if (!name && !value) {
    // 整行留空视为占位行，不报错，保存时直接丢弃。
    return {};
  }
  const issue: HeaderRowIssue = {};
  if (!name || !value) {
    issue.incomplete = true;
  }
  if (name && !isValidModelRequestHeaderName(name)) {
    issue.name = "invalid";
  }
  if (value && !isValidModelRequestHeaderValue(value)) {
    issue.value = "invalid";
  }
  return issue;
}

/** 逐行校验草稿；重名按整表判定（不区分大小写）。 */
export function validateHeaderRows(rows: readonly HeaderRowDraft[]): HeaderRowIssue[] {
  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name || !isValidModelRequestHeaderName(name)) continue;
    const key = name.toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    const issue = normalizedRowIssue(row);
    const key = row.name.trim().toLowerCase();
    if (!issue.name && key && (nameCounts.get(key) ?? 0) > 1) {
      issue.name = "duplicate";
    }
    return issue;
  });
}

/** 校验并压缩草稿为可持久化条目；存在任何问题时返回 undefined。 */
export function toHeaderEntries(
  rows: readonly HeaderRowDraft[],
): CustomModelRequestHeaderEntry[] | undefined {
  const issues = validateHeaderRows(rows);
  if (issues.some((issue) => issue.name || issue.value || issue.incomplete)) {
    return undefined;
  }
  return rows
    .filter((row) => row.name.trim() && row.value.trim())
    .map((row) => ({ name: row.name.trim(), value: row.value.trim() }));
}

/**
 * 用户自定义模型请求头的 key-value 行编辑器（specs/custom-request-headers.md）。
 * 受控组件：行数据由 CustomSection 持有；这里只负责渲染与逐行增删，校验结果就地展示。
 */
export function CustomRequestHeadersEditor({
  rows,
  onRowsChange,
  disabled,
}: {
  rows: readonly HeaderRowDraft[];
  onRowsChange: (rows: HeaderRowDraft[]) => void;
  disabled?: boolean;
}) {
  const { intl } = useZCodeIntl();
  const issues = validateHeaderRows(rows);
  const atLimit = rows.length >= CUSTOM_MODEL_REQUEST_HEADERS_MAX_ENTRIES;

  const updateRow = (index: number, patch: Partial<HeaderRowDraft>) => {
    onRowsChange(rows.map((row, current) => (current === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number) => {
    onRowsChange(rows.filter((_row, current) => current !== index));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const issue = issues[index] ?? {};
        const issueTextId = issue.incomplete
          ? "settings.custom.headers.incompleteRow"
          : issue.name === "invalid"
            ? "settings.custom.headers.invalidName"
            : issue.name === "duplicate"
              ? "settings.custom.headers.duplicateName"
              : issue.value === "invalid"
                ? "settings.custom.headers.invalidValue"
                : undefined;
        return (
          <div key={index} className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                size="lg"
                value={row.name}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                placeholder={intl.formatMessage({ id: "settings.custom.headers.namePlaceholder" })}
                aria-label={intl.formatMessage({ id: "settings.custom.headers.nameLabel" })}
                onChange={(event) => updateRow(index, { name: event.currentTarget.value })}
                data-testid={`settings-custom-header-name-${index}`}
                className="max-w-64 font-mono"
              />
              <Input
                size="lg"
                value={row.value}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                placeholder={intl.formatMessage({ id: "settings.custom.headers.valuePlaceholder" })}
                aria-label={intl.formatMessage({ id: "settings.custom.headers.valueLabel" })}
                onChange={(event) => updateRow(index, { value: event.currentTarget.value })}
                data-testid={`settings-custom-header-value-${index}`}
                className="min-w-0 flex-1 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled}
                aria-label={intl.formatMessage({ id: "settings.custom.headers.removeRow" })}
                title={intl.formatMessage({ id: "settings.custom.headers.removeRow" })}
                onClick={() => removeRow(index)}
                data-testid={`settings-custom-header-remove-${index}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {issueTextId ? (
              <div className="text-ui-sm text-destructive">
                {intl.formatMessage({ id: issueTextId })}
              </div>
            ) : null}
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || atLimit}
          title={
            atLimit
              ? intl.formatMessage(
                  { id: "settings.custom.headers.maxEntriesReached" },
                  { count: CUSTOM_MODEL_REQUEST_HEADERS_MAX_ENTRIES },
                )
              : undefined
          }
          onClick={() => onRowsChange([...rows, { name: "", value: "" }])}
          data-testid="settings-custom-header-add-row"
        >
          <Plus className="size-4" />
          {intl.formatMessage({ id: "settings.custom.headers.addRow" })}
        </Button>
        {atLimit ? (
          <span className="ml-2 text-ui-sm text-foreground-subtle">
            {intl.formatMessage(
              { id: "settings.custom.headers.maxEntriesReached" },
              { count: CUSTOM_MODEL_REQUEST_HEADERS_MAX_ENTRIES },
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
