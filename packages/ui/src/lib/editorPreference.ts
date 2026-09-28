interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const LAST_SELECTED_EDITOR_STORAGE_KEY = "zcode-last-editor-id";

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLastSelectedEditorId(
  storage: StorageLike | null = getBrowserStorage(),
): string | null {
  const rawValue = storage?.getItem(LAST_SELECTED_EDITOR_STORAGE_KEY);
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    return null;
  }

  return rawValue;
}

export function persistLastSelectedEditorId(
  editorId: string,
  storage: StorageLike | null = getBrowserStorage(),
) {
  storage?.setItem(LAST_SELECTED_EDITOR_STORAGE_KEY, editorId);
}

/** 删除的是当前选中的自定义应用等场景：清除偏好，让选择回落到列表第一项。 */
export function clearLastSelectedEditorId(storage: StorageLike | null = getBrowserStorage()): void {
  storage?.removeItem(LAST_SELECTED_EDITOR_STORAGE_KEY);
}
