// 计划模式列表操作：真实 Tab / Enter / 点击只修改 Composer，发送复用标准 Plan。
import { clearAppData, setInputValueByTestIdDom } from "#e2e/helpers/desktop-app";
import { TID_V4_COMPOSER_INPUT } from "@zcode/shared/test-ids";
import {
  assertVisibleV4UserMessagesNotContaining,
  clickV4Send,
  getV4ComposerAttachments,
  getV4ConfigProjection,
  getV4Messages,
  pasteV4ComposerImageAttachment,
  prepareV4ConversationE2E,
  sendV4Prompt,
  startNewV4Draft,
  switchV4Mode,
  waitForV4ComposerText,
  waitForV4Pane,
  waitForV4TimelineContaining,
  waitForV4UserMessageContaining,
} from "#e2e/helpers/v4-conversation";
import { selectUpstreamModel } from "#e2e/helpers/upstream-provider";
import {
  countUpstreamTitleRequestsContaining,
  getUpstreamRequestRecordCount,
  waitForUpstreamRequest,
} from "#e2e/helpers/conversation-session-network";

const SEED_PROMPT = "E2E_V4_PLAN_SHORTCUT_SEED 建立已有会话";
const SEED_REPLY = "V4_PLAN_SHORTCUT_SEED_OK";
const TASK_ONE = "E2E_V4_PLAN_SHORTCUT_TASK_ONE 列出实现步骤";
const TASK_ONE_REPLY = "V4_PLAN_SHORTCUT_TASK_ONE_OK";
const TASK_TWO = "E2E_V4_PLAN_SHORTCUT_TASK_TWO 已处于 Plan 继续发送";
const TASK_TWO_REPLY = "V4_PLAN_SHORTCUT_TASK_TWO_OK";
// 以下声明与 waitForPlanMode 取自合并基线（fork HEAD 本地函数 + 上游 MERGE_HEAD 常量）：
// v3.18.0 目录重组合并时保留了两版的调用点但丢失定义，导致 TS2304。
const PLAN_OPTION = '[data-option-id="app-slash:plan"]';
let shellReady = false;

async function waitForPlanMode() {
  await browser.waitUntil(async () => (await getV4ConfigProjection()).planEnabled, {
    timeout: 30000,
    timeoutMsg: "`/plan` 后输入框的 Plan 标记没有开启",
  });
}

async function prepareCase() {
  // 首次测试之后默认项目已切换，复用 provider，避免重复等待启动项目。
  await prepareV4ConversationE2E({ skipShellReady: shellReady, skipProvider: shellReady });
  if (shellReady) await selectUpstreamModel();
  shellReady = true;
  if ((await getV4ConfigProjection()).planEnabled) {
    await $('[data-testid="v4-composer-plan-marker"] button').click();
  }
  await switchV4Mode("build");
}

async function enterSearch(text = "/plan") {
  await setInputValueByTestIdDom(TID_V4_COMPOSER_INPUT, text, {
    timeout: 15000,
    timeoutMsg: "未写入 Plan 搜索词",
  });
  await $(PLAN_OPTION).waitForDisplayed({ timeout: 15000 });
  const optionText = await $(PLAN_OPTION).getText();
  expect(optionText).toMatch(/计划模式|Plan mode/);
  // 面板选项是「斜杠命令名 + 本地化描述」：label 固定为 /plan，描述说明它会开启计划模式。
  // 曾经断言过 not.toContain("/plan")（要求面板不再展示命令名），但 7c20a02c71 连同
  // AppSlashCommand.label 与 chat.slash.app.plan.label 文案一起回退了该行为，
  // 面板恢复展示斜杠命令名，断言随之过期。
  expect(optionText).toContain("/plan");
}

async function assertSelected(expectedText: string) {
  await waitForV4ComposerText(expectedText, "选中计划模式后正文不匹配");
  await browser.waitUntil(async () => (await getV4ConfigProjection()).planEnabled, {
    timeout: 30000,
    timeoutMsg: "`/plan` 后输入框的 Plan 标记没有开启",
  });
}

async function establishBuildSession() {
  await prepareV4ConversationE2E();
  // 每个组合都从 build 起步，避免前一个 case 的 draft preference 影响当前 mode CAS 断言。
  await switchV4Mode("build");
  const titleCountBefore = await countUpstreamTitleRequestsContaining(SEED_PROMPT);
  await sendV4Prompt(SEED_PROMPT);
  await waitForV4TimelineContaining(SEED_REPLY, 45000);
  await waitForV4Pane(
    (snapshot) =>
      !snapshot.canStop && snapshot.sessionId !== "draft" && snapshot.sessionId !== null,
    "`/plan` E2E seed 没有回到已有 idle session",
    45000,
  );
  // 首轮结束后标题请求仍会异步发出；先等待种子会话的标题请求，避免计入空 /plan。
  await browser.waitUntil(
    async () => (await countUpstreamTitleRequestsContaining(SEED_PROMPT)) > titleCountBefore,
    { timeout: 30000, timeoutMsg: "种子会话的标题请求未发出" },
  );
}

async function waitForReadyComposerAttachment(filename: string) {
  await browser.waitUntil(
    async () => {
      const attachments = await getV4ComposerAttachments();
      // Bug 原因：图片卡按设计只显示缩略图，filename 不保证是可见文本；本 case
      // 只有一个附件，数量与 ready 状态才是稳定的发送前契约。
      return attachments.length === 1 && attachments[0]?.uploadStatus === "ready";
    },
    { timeout: 30000, timeoutMsg: `附件没有进入 ready：${filename}` },
  );
}

describe("v4 `/plan` Composer shortcut", () => {
  after(async () => {
    await browser.electron.restoreAllMocks();
    await clearAppData();
  });

  it("draft `/PLAN` 空命令只切换模式，不创建 user row 或 provider request", async function () {
    this.timeout(120000);
    await prepareV4ConversationE2E();
    await startNewV4Draft();
    await switchV4Mode("build");
    const requestCountBefore = await getUpstreamRequestRecordCount();

    await sendV4Prompt("  /PLAN   ");
    await waitForV4ComposerText("", "空 `/plan` 消费后 composer 没有清空");
    await waitForPlanMode();

    expect(await getV4Messages("user")).toHaveLength(0);
    expect(await getUpstreamRequestRecordCount()).toBe(requestCountBefore);
  });

  it("existing session `/plan` 空命令只切换模式，不新增 user row 或 provider request", async function () {
    this.timeout(120000);
    await establishBuildSession();
    const userMessagesBefore = await getV4Messages("user");
    const requestCountBefore = await getUpstreamRequestRecordCount();

    await sendV4Prompt("/plan");
    await waitForV4ComposerText("", "已有会话空 `/plan` 消费后 composer 没有清空");
    await waitForPlanMode();

    expect(await getV4Messages("user")).toHaveLength(userMessagesBefore.length);
    expect(await getUpstreamRequestRecordCount()).toBe(requestCountBefore);
  });

  it("任务命令先切 Plan 再发送正文，且 Plan noop 后仍可继续发送", async function () {
    this.timeout(180000);
    await establishBuildSession();

    await sendV4Prompt(`/plan ${TASK_ONE}`);
    await waitForUpstreamRequest(
      {
        lastUserMessageIncludes: [TASK_ONE],
        lastUserMessageExcludes: ["/plan"],
      },
      "`/plan <task>` provider request 没有只发送任务正文",
      60000,
    );
    await waitForV4TimelineContaining(TASK_ONE_REPLY, 60000);
    await waitForPlanMode();
    await waitForV4UserMessageContaining(TASK_ONE);

    // 当前 session 已经是 Plan；第二次 shortcut 的 mode CAS 应 noop，但仍需发送普通文本。
    await sendV4Prompt(`/plan ${TASK_TWO}`);
    await waitForUpstreamRequest(
      {
        lastUserMessageIncludes: [TASK_TWO],
        lastUserMessageExcludes: ["/plan"],
      },
      "Plan noop 后 `/plan <task>` 没有继续发送正文",
      60000,
    );
    await waitForV4TimelineContaining(TASK_TWO_REPLY, 60000);
    await waitForV4UserMessageContaining(TASK_TWO);
    await assertVisibleV4UserMessagesNotContaining("/plan");
  });

  it("附件拒绝时保留 `/plan <task>` 草稿、附件和当前模式", async function () {
    this.timeout(120000);
    await prepareV4ConversationE2E();
    await startNewV4Draft();
    await switchV4Mode("build");
    const modeBefore = (await getV4ConfigProjection()).mode;
    const requestCountBefore = await getUpstreamRequestRecordCount();
    const attachmentName = "e2e-plan-shortcut-rejected.png";
    const draft = "/plan plan-shortcut-attachment-reject";

    await pasteV4ComposerImageAttachment(attachmentName);
    await waitForReadyComposerAttachment(attachmentName);
    await setInputValueByTestIdDom(TID_V4_COMPOSER_INPUT, draft, {
      timeout: 15000,
      timeoutMsg: "附件拒绝 case 没有写入 `/plan` 草稿",
    });
    await waitForV4ComposerText(draft, "附件拒绝 case 没有写入 `/plan` 草稿");

    await clickV4Send();
    await waitForV4ComposerText(draft, "附件拒绝后 composer 草稿没有保留");
    expect((await getV4ConfigProjection()).mode).toBe(modeBefore);
    expect(await getUpstreamRequestRecordCount()).toBe(requestCountBefore);
    expect(await getV4ComposerAttachments()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uploadStatus: "ready",
        }),
      ]),
    );
  });
});
