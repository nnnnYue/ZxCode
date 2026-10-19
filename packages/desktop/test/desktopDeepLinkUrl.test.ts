import { describe, expect, it } from "vitest";

// fork 适配：深链 scheme 为 zxcode；OAuth 回调与 share import 辅助已随 OAuth 功能剔除，
// 仅保留 payment / workspace open / argv 提取等仍在 src/main/desktopDeepLinkUrl.ts 的能力。
describe("desktop deep link url helpers", () => {
  it("accepts Linux one-slash payment callback urls", async () => {
    const { isPaymentCallbackUrl } = await import("../src/main/desktopDeepLinkUrl.js");

    expect(isPaymentCallbackUrl(new URL("zxcode:/payment/callback?status=return"))).toBe(true);
    expect(isPaymentCallbackUrl(new URL("zxcode:payment/callback?status=cancel"))).toBe(true);
  });

  it("recognizes payment callback urls", async () => {
    const { isPaymentCallbackUrl } = await import("../src/main/desktopDeepLinkUrl.js");

    const paymentUrl = new URL("zxcode://payment/callback?provider=zai&channel=paypal");
    expect(isPaymentCallbackUrl(paymentUrl)).toBe(true);
    expect(isPaymentCallbackUrl(new URL("zxcode://payment/other"))).toBe(false);
  });

  it("recognizes workspace open urls and extracts the encoded folder path", async () => {
    const { extractWorkspaceOpenPath, isWorkspaceOpenUrl } =
      await import("../src/main/desktopDeepLinkUrl.js");

    const workspaceUrl = new URL("zxcode://workspace/open?path=%2FUsers%2Fdemo%2FProject%20A%26B");
    expect(isWorkspaceOpenUrl(workspaceUrl)).toBe(true);
    expect(extractWorkspaceOpenPath(workspaceUrl)).toBe("/Users/demo/Project A&B");
    expect(isWorkspaceOpenUrl(new URL("zxcode://workspace/other?path=%2Ftmp"))).toBe(false);
    expect(extractWorkspaceOpenPath(new URL("zxcode://workspace/open"))).toBeNull();
  });

  it("extracts protocol urls from desktop argv variants", async () => {
    const { extractDeepLinkUrlFromArgs } = await import("../src/main/desktopDeepLinkUrl.js");
    // fork 完整性判定：payment 回调需 provider+channel+status 齐备才直接采用，否则回退首个候选。
    const completePaymentUrl = "zxcode://payment/callback?provider=zai&channel=paypal&status=return";

    expect(
      extractDeepLinkUrlFromArgs(["/opt/ZxCode/zxcode", completePaymentUrl]),
    ).toBe(completePaymentUrl);
    expect(
      extractDeepLinkUrlFromArgs(["/opt/ZxCode/zxcode", `--open-url=${completePaymentUrl}`]),
    ).toBe(completePaymentUrl);
    expect(
      extractDeepLinkUrlFromArgs([
        "/opt/ZxCode/zxcode",
        "zxcode%3A%2F%2Fpayment%2Fcallback%3Fprovider%3Dzai%26channel%3Dpaypal%26status%3Dreturn",
      ]),
    ).toBe(completePaymentUrl);
    expect(
      extractDeepLinkUrlFromArgs([
        "/opt/ZxCode/zxcode",
        "zxcode%253A%252F%252Fpayment%252Fcallback%253Fprovider%253Dzai%2526channel%253Dpaypal%2526status%253Dreturn",
      ]),
    ).toBe(completePaymentUrl);
    expect(
      extractDeepLinkUrlFromArgs([
        "/opt/ZxCode/zxcode",
        "zxcode://payment/callback?provider=zai&channel=paypal",
        "&status=return",
      ]),
    ).toBe(completePaymentUrl);
    expect(
      extractDeepLinkUrlFromArgs([
        "/opt/ZxCode/zxcode",
        "zxcode://payment/callback?provider=zai&amp;channel=paypal&amp;status=return",
      ]),
    ).toBe(completePaymentUrl);
    expect(
      extractDeepLinkUrlFromArgs([
        "/opt/ZxCode/zxcode",
        "zxcode://payment/callback?provider=zai",
        "&channel=paypal",
        "&status=return",
      ]),
    ).toBe(completePaymentUrl);
    expect(
      extractDeepLinkUrlFromArgs([
        "/Applications/ZxCode.app/Contents/MacOS/ZxCode",
        "zxcode://workspace/open?path=%2FUsers%2Fdemo%2FProject%2520A",
      ]),
    ).toBe("zxcode://workspace/open?path=%2FUsers%2Fdemo%2FProject%2520A");
  });

  it("returns null when argv does not contain a deep link", async () => {
    const { extractDeepLinkUrlFromArgs } = await import("../src/main/desktopDeepLinkUrl.js");

    expect(extractDeepLinkUrlFromArgs(["/opt/ZxCode/zxcode", "--no-sandbox"])).toBeNull();
  });

  it("extracts Windows open workspace argv without URL decoding", async () => {
    const { extractOpenWorkspacePathFromArgs } = await import("../src/main/desktopDeepLinkUrl.js");

    expect(
      extractOpenWorkspacePathFromArgs([
        "C:\\Program Files\\ZxCode\\ZxCode.exe",
        "--open-workspace",
        "C:\\Users\\demo\\Project A&B#1",
      ]),
    ).toBe("C:\\Users\\demo\\Project A&B#1");
    expect(
      extractOpenWorkspacePathFromArgs([
        "C:\\Program Files\\ZxCode\\ZxCode.exe",
        "--open-workspace=C:\\Users\\demo\\Project%20A",
      ]),
    ).toBe("C:\\Users\\demo\\Project%20A");
    expect(extractOpenWorkspacePathFromArgs(["ZxCode.exe", "--open-workspace", 'C:"'])).toBe("C:\\");
    expect(
      extractOpenWorkspacePathFromArgs(["ZxCode.exe", "--open-workspace", 'C:\\repo"']),
    ).toBe("C:\\repo\\");
    expect(extractOpenWorkspacePathFromArgs(["ZxCode.exe", "--open-workspace"])).toBeNull();
  });

  it("passes parsed deep links through single instance additionalData", async () => {
    const {
      createDeepLinkSingleInstanceData,
      extractDeepLinkUrlFromSingleInstanceData,
      extractOpenWorkspacePathFromSingleInstanceData,
    } = await import("../src/main/desktopDeepLinkUrl.js");

    const additionalData = createDeepLinkSingleInstanceData([
      "/opt/ZxCode/zxcode",
      "zxcode%253A%252F%252Fpayment%252Fcallback%253Fcode%253D1%2526state%253Ds",
      "--open-workspace=C:\\Users\\demo\\Project A",
    ]);

    expect(extractDeepLinkUrlFromSingleInstanceData(additionalData)).toBe(
      "zxcode://payment/callback?code=1&state=s",
    );
    expect(extractOpenWorkspacePathFromSingleInstanceData(additionalData)).toBe(
      "C:\\Users\\demo\\Project A",
    );
    expect(extractDeepLinkUrlFromSingleInstanceData({ deepLinkUrl: "https://example.com" })).toBe(
      null,
    );
  });

  it("builds Windows Explorer registry operations for folder context menu", async () => {
    const { buildWindowsOpenFolderCommand, buildWindowsOpenFolderRegistryOperations } =
      await import("../src/main/desktopWindowsOpenFolderContextMenu.js");

    expect(buildWindowsOpenFolderCommand("C:\\Program Files\\ZxCode\\ZxCode.exe")).toBe(
      '"C:\\Program Files\\ZxCode\\ZxCode.exe" --open-workspace "%1"',
    );
    expect(
      buildWindowsOpenFolderCommand("C:\\Electron\\electron.exe", ["C:\\repo\\desktop\\main.js"]),
    ).toBe('"C:\\Electron\\electron.exe" "C:\\repo\\desktop\\main.js" --open-workspace "%1"');

    const operations = buildWindowsOpenFolderRegistryOperations({
      executablePath: "C:\\Program Files\\ZxCode\\ZxCode.exe",
      locale: "en-US",
    });

    expect(operations).toContainEqual({
      args: [
        "add",
        "HKCU\\Software\\Classes\\Directory\\shell\\ZxCode.OpenInZxCode\\command",
        "/ve",
        "/d",
        '"C:\\Program Files\\ZxCode\\ZxCode.exe" --open-workspace "%1"',
        "/f",
      ],
    });
    expect(operations).toContainEqual({
      args: [
        "add",
        "HKCU\\Software\\Classes\\Drive\\shell\\ZxCode.OpenInZxCode\\command",
        "/ve",
        "/d",
        '"C:\\Program Files\\ZxCode\\ZxCode.exe" --open-workspace "%1"',
        "/f",
      ],
    });
  });

  it("builds localized Windows Explorer registry menu labels", async () => {
    const { buildWindowsOpenFolderRegistryOperations, getWindowsOpenFolderMenuName } =
      await import("../src/main/desktopWindowsOpenFolderContextMenu.js");

    // fork 菜单文案：中文保留「在ZCode中打开」，英文为 Open in ZxCode。
    expect(getWindowsOpenFolderMenuName("zh-CN")).toBe("在ZCode中打开");
    expect(getWindowsOpenFolderMenuName("en-US")).toBe("Open in ZxCode");

    const operations = buildWindowsOpenFolderRegistryOperations({
      executablePath: "C:\\Program Files\\ZxCode\\ZxCode.exe",
      locale: "zh-CN",
    });

    expect(operations).toContainEqual({
      args: [
        "add",
        "HKCU\\Software\\Classes\\Directory\\shell\\ZxCode.OpenInZxCode",
        "/ve",
        "/d",
        "在ZCode中打开",
        "/f",
      ],
    });
    expect(operations).toContainEqual({
      args: [
        "add",
        "HKCU\\Software\\Classes\\Directory\\shell\\ZxCode.OpenInZxCode",
        "/v",
        "MUIVerb",
        "/t",
        "REG_SZ",
        "/d",
        "在ZCode中打开",
        "/f",
      ],
    });
  });
});
