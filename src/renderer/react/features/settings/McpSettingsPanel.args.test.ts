// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServerConfigView } from "../../../settings/shared/types";
import { McpSettingsPanel } from "./McpSettingsPanel";

// 保留真实设置面板、Ant Design 控件和 DOM 事件，只隔离翻译、图标及 IPC。
vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@lobehub/icons", () => ({ MCP: () => null }));

const addMcpServer = vi.fn(async (_config: McpServerConfigView) => ({ ok: true, toolIds: [] }));
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  })));
  vi.stubGlobal("settings", {
    listMcpServerConfigs: vi.fn(async () => []),
    listMcpServers: vi.fn(async () => []),
    getGeneral: vi.fn(async () => ({})),
    addMcpServer,
  });
  addMcpServer.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function clickControl(key: string) {
  // Modal 挂在 document.body 的 Portal 中；从真实控件触发切换及提交。
  const control = [...document.querySelectorAll<HTMLElement>("button, label")]
    .find((node) => node.textContent === `settingsPage.mcp.${key}`);
  expect(control, `找不到 MCP 控件：${key}`).toBeDefined();
  await act(async () => control!.click());
}

async function setText(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  expect(input, `找不到输入框：${id}`).not.toBeNull();
  const prototype = input!.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openJson(args: string[]) {
  await act(async () => root.render(createElement(McpSettingsPanel)));
  await clickControl("addServer");
  await clickControl("jsonMode");
  await setText("cy-mcp-json", JSON.stringify({
    mcpServers: { demo: { command: "node", args, env: { EXAMPLE_ONLY: "unchanged" } } },
  }));
}

function expectSubmittedArgs(args: string[]) {
  expect(addMcpServer).toHaveBeenCalledExactlyOnceWith({
    id: "demo", name: "demo", transport: "stdio", command: "node", args,
    env: { EXAMPLE_ONLY: "unchanged" },
  });
}

describe("MCP 参数在模式切换和提交时保留边界", () => {
  const args = [
    "C:\\My Folder\\server.js",
    "--label",
    "hello world",
    'say "hello"',
    "C:\\tools\\",
    "",
    "first\nsecond",
    "left\tright",
  ];

  it("反复切换 JSON → 表单 → JSON 后参数及其他字段保持不变", async () => {
    await openJson(args);

    for (let round = 0; round < 3; round++) {
      await clickControl("formMode");
      await clickControl("jsonMode");
      const json = document.querySelector<HTMLTextAreaElement>("#cy-mcp-json")!.value;
      expect(JSON.parse(json)).toEqual({
        mcpServers: { demo: { command: "node", args, env: { EXAMPLE_ONLY: "unchanged" } } },
      });
    }
    expect(addMcpServer).not.toHaveBeenCalled();
  });

  it("从 JSON 切到表单后确认，将原始参数数组完整交给 IPC", async () => {
    await openJson(args);
    await clickControl("formMode");
    await clickControl("confirm");

    expectSubmittedArgs(args);
  });

  it("直接在 JSON 模式确认，同样保留空参数和特殊字符", async () => {
    await openJson(args);
    await clickControl("confirm");

    expectSubmittedArgs(args);
  });

  it("表单中的普通空格分隔参数仍可切换并正常提交", async () => {
    await openJson([]);
    await clickControl("formMode");
    await setText("cy-mcp-args", "  -y   @modelcontextprotocol/server-memory  ");
    await clickControl("jsonMode");
    await clickControl("formMode");
    await clickControl("confirm");

    expectSubmittedArgs(["-y", "@modelcontextprotocol/server-memory"]);
  });

  it("参数 JSON 无效时保留表单草稿且阻止提交，修正后可以提交", async () => {
    await openJson(["original"]);
    await clickControl("formMode");
    await setText("cy-mcp-args", '["unterminated');
    await clickControl("jsonMode");

    expect(document.querySelector("#cy-mcp-json")).toBeNull();
    expect(document.querySelector<HTMLInputElement>("#cy-mcp-args")?.value).toBe('["unterminated');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("settingsPage.mcp.argsInvalid");
    expect(addMcpServer).not.toHaveBeenCalled();

    await clickControl("confirm");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("settingsPage.mcp.argsInvalid");
    expect(addMcpServer).not.toHaveBeenCalled();

    await setText("cy-mcp-args", JSON.stringify(["hello world", ""]));
    await clickControl("confirm");
    expectSubmittedArgs(["hello world", ""]);
  });
});
