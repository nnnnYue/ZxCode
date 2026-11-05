export const VERIFIED_DOCKER_TABLE_END_MARKER = "<!-- conversation-session-verified-table-end -->";

const VERIFIED_DOCKER_TABLE_HEADER = "| Spec | 迁移状态 |";

export function insertVerifiedDockerSpecRow(text, specRelFromDesktop) {
  const row = `| \`${specRelFromDesktop}\` | verified |`;
  if (text.includes(row) || text.includes(`| \`${specRelFromDesktop}\` |`)) {
    return { inserted: false, text };
  }
  if (!text.includes(VERIFIED_DOCKER_TABLE_END_MARKER)) {
    return {
      error: "Cannot find Docker suite table end marker",
      inserted: false,
      text,
    };
  }

  // oxfmt 会在表格与结尾注释之间留一个空行；若紧贴注释前插入，新行会落在空行之后
  // 脱离 markdown 表格。因此从表头锚点出发，跳过分隔行后扫到最后一个连续表格行，
  // 插到它后面；空表时自然插成分行首行。
  const lines = text.split("\n");
  const headerIndex = lines.indexOf(VERIFIED_DOCKER_TABLE_HEADER);
  if (headerIndex === -1) {
    return {
      error: "Cannot find Docker suite table header",
      inserted: false,
      text,
    };
  }
  let insertAt = headerIndex + 2;
  while (insertAt < lines.length && lines[insertAt].startsWith("|")) {
    insertAt += 1;
  }
  lines.splice(insertAt, 0, row);
  return { inserted: true, text: lines.join("\n") };
}
