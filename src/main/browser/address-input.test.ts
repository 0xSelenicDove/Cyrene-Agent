import { describe, expect, it } from "vitest";
import { normalizeAddressInput } from "./address-input";

describe("地址栏输入补全协议", () => {
  it.each([
    ["google.com", "https://google.com"],
    ["  google.com  ", "https://google.com"],
    ["www.bilibili.com/video/BV1xx411c7mD?p=2", "https://www.bilibili.com/video/BV1xx411c7mD?p=2"],
    ["github.com:443", "https://github.com:443"],
    ["例子.中国", "https://例子.中国"],
    ["xn--fsqu00a.xn--fiqs8s", "https://xn--fsqu00a.xn--fiqs8s"],
    ["8.8.8.8", "https://8.8.8.8"],
  ])("公网域名 / IP 补 https：%s", (input, expected) => {
    expect(normalizeAddressInput(input)).toBe(expected);
    expect(new URL(expected).protocol).toBe("https:");
  });

  it.each([
    ["localhost", "http://localhost"],
    ["localhost:3000", "http://localhost:3000"],
    ["LOCALHOST:5173/settings#general", "http://LOCALHOST:5173/settings#general"],
    ["app.localhost:8080", "http://app.localhost:8080"],
    ["127.0.0.1:8080", "http://127.0.0.1:8080"],
    ["192.168.1.10", "http://192.168.1.10"],
    ["10.0.0.2:9000/api", "http://10.0.0.2:9000/api"],
    ["172.20.0.5", "http://172.20.0.5"],
    ["[::1]:3000", "http://[::1]:3000"],
  ])("本机 / 局域网地址补 http：%s", (input, expected) => {
    expect(normalizeAddressInput(input)).toBe(expected);
    expect(new URL(expected).protocol).toBe("http:");
  });

  it.each([
    "https://google.com",
    "http://localhost:3000",
    "HTTPS://Example.com",
  ])("已带 http(s) 协议的输入原样保留：%s", (input) => {
    expect(normalizeAddressInput(input)).toBe(input);
  });

  it.each([
    "javascript:alert(1)",
    "file:///C:/Windows/win.ini",
    "about:blank",
    "mailto:someone@example.com",
    "data:text/html,hi",
  ])("其他协议不补全，交给控制器按 unsupported_protocol 拒绝：%s", (input) => {
    expect(normalizeAddressInput(input)).toBe(input);
  });

  it.each([
    "",
    "   ",
    "cyrene agent",
    "昔涟",
    "intranet",
    "1.5",
    "user@example.com",
    "localhost:99999",
    "localhost:abc",
    "-bad-.com",
    "999.1.1.1",
  ])("认不出的输入原样返回（不猜测、不拼搜索）：%j", (input) => {
    expect(normalizeAddressInput(input)).toBe(input);
  });
});
