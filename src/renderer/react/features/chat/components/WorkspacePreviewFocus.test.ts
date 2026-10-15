// @vitest-environment jsdom
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePreviewContent, type WorkspacePreview } from "./WorkspacePreview";

vi.mock("../../../i18n", () => ({ t: (key: string) => key, useTranslation: () => ({ t: (key: string) => key }) }));
const svg: WorkspacePreview = { kind: "svg", svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>fixture</text></svg>' };
const image: WorkspacePreview = { kind: "image", attachment: {
  kind: "image", id: "fixture", source: "model", status: "done", name: "fixture.png", filePath: "fixture.png",
  mime: "image/png", byteLength: 42, previewUrl: "data:image/png;base64,iVBORw0KGgo=",
} };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // JSDOM 默认零尺寸会让 Ant Design 的焦点锁找不到目标，掩盖浏览器中的回拉。
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 40));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(preview = svg, active = true) { await act(async () => root.render(createElement(WorkspacePreviewContent, { preview, active }))); }
async function click(selector: string, scope: ParentNode = document) {
  const node = scope.querySelector<HTMLElement>(selector); expect(node).not.toBeNull(); await act(async () => node!.click());
}
async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 1_500;
  while (!condition() && Date.now() < deadline) await act(async () => {
    // JSDOM 不会生成 CSS 动画结束事件；沿真实关闭生命周期推进，而不绕过回调。
    for (const node of document.querySelectorAll(".ant-modal, .ant-modal-mask")) {
      node.dispatchEvent(new Event("animationend", { bubbles: true }));
      node.dispatchEvent(new Event("transitionend", { bubbles: true }));
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  expect(condition()).toBe(true);
}
describe("workspace preview focus after dialog cleanup", () => {
  it.each([image, svg].flatMap(preview => ["button", "Escape"].map(method => ({ preview, kind: preview.kind, method }))))(
    "restores $kind focus after $method closes its focus trap", async ({ preview, method }) => {
      await render(preview); await click(".cy-workspace-preview__zoom", host);
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      if (method === "Escape") await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      else await click(preview.kind === "svg" ? ".ant-modal-close" : ".cy-generated-image-preview__close");
      const trigger = host.querySelector(".cy-workspace-preview__zoom");
      await waitFor(() => !document.querySelector('[role="dialog"]') && document.activeElement === trigger);
    },
  );
  it("does not let an old SVG close finish a reopened preview", async () => {
    await render(); await click(".cy-workspace-preview__zoom", host);
    await click(".ant-modal-close");
    await click(".cy-workspace-preview__zoom", host);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click(".ant-modal-close");
    await waitFor(() => !document.querySelector('[role="dialog"]') && document.activeElement === host.querySelector(".cy-workspace-preview__zoom"));
  });
  it("removes a closing SVG immediately when its tab becomes inactive", async () => {
    await render(); await click(".cy-workspace-preview__zoom", host);
    await act(async () => {
      document.querySelector<HTMLElement>(".ant-modal-close")!.click();
      root.render(createElement(WorkspacePreviewContent, { preview: svg, active: false }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await render(); expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("does not focus a trigger removed while the SVG is closing", async () => {
    await render(); await click(".cy-workspace-preview__zoom", host);
    const trigger = host.querySelector<HTMLElement>(".cy-workspace-preview__zoom")!;
    const focus = vi.spyOn(trigger, "focus");
    await act(async () => { document.querySelector<HTMLElement>(".ant-modal-close")!.click(); trigger.remove(); });
    await waitFor(() => !document.querySelector('[role="dialog"]'));
    expect(focus).not.toHaveBeenCalled();
  });
});
