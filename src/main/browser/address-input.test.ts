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
    ["foo_bar.example.com", "https://foo_bar.example.com"],
    ["nas_01.home", "https://nas_01.home"],
    ["8.8.8.8", "https://8.8.8.8"],
    ["[2001:4860:4860::8888]", "https://[2001:4860:4860::8888]"],
    ["[::ffff:8.8.8.8]", "https://[::ffff:8.8.8.8]"],
  ])("公网域名 / IP 补 https：%s", (input, expected) => {
    expect(normalizeAddressInput(input)).toBe(expected);
    expect(new URL(expected).protocol).toBe("https:");
  });

  it.each([
    ["localhost", "http://localhost"],
    ["localhost:3000", "http://localhost:3000"],
    ["localhost:0", "http://localhost:0"],
    ["LOCALHOST:5173/settings#general", "http://LOCALHOST:5173/settings#general"],
    ["app.localhost:8080", "http://app.localhost:8080"],
    ["127.0.0.1:8080", "http://127.0.0.1:8080"],
    ["192.168.1.10", "http://192.168.1.10"],
    ["10.0.0.2:9000/api", "http://10.0.0.2:9000/api"],
    ["172.20.0.5", "http://172.20.0.5"],
    ["[::1]:3000", "http://[::1]:3000"],
    ["[fe80::1]", "http://[fe80::1]"],
    ["[fd00::1]:8080", "http://[fd00::1]:8080"],
    ["[::ffff:192.168.0.1]", "http://[::ffff:192.168.0.1]"],
  ])("本机 / 局域网地址补 http：%s", (input, expected) => {
    expect(normalizeAddressInput(input)).toBe(expected);
    expect(new URL(expected).protocol).toBe("http:");
  });

  it.each([
    // 解析器把补零段按八进制读：原文像内网的实为公网，原文像公网的实为本机
    ["010.010.010.010", "https://010.010.010.010", "8.8.8.8"],
    ["0177.0.0.1", "http://0177.0.0.1", "127.0.0.1"],
  ])("按解析器规范化后的 IPv4 选协议：%s", (input, expected, canonicalHost) => {
    expect(normalizeAddressInput(input)).toBe(expected);
    expect(new URL(expected).hostname).toBe(canonicalHost);
  });

  it.each([
    ["例子。中国", "https://例子.中国"],
    ["www。google。com", "https://www.google.com"],
    ["www．google．com", "https://www.google.com"],
    ["localhost：3000", "http://localhost:3000"],
    ["example.com/路径。不变", "https://example.com/路径。不变"],
  ])("主机部分的全角句点 / 冒号归一化，路径保持原样：%s", (input, expected) => {
    expect(normalizeAddressInput(input)).toBe(expected);
    expect(() => new URL(expected)).not.toThrow();
  });

  it.each([
    ["example.com/search?q=cyrene agent", "https://example.com/search?q=cyrene agent", "https://example.com/search?q=cyrene%20agent"],
    ["github.com/foo bar#a b", "https://github.com/foo bar#a b", "https://github.com/foo%20bar#a%20b"],
    ["localhost:3000/a b", "http://localhost:3000/a b", "http://localhost:3000/a%20b"],
  ])("路径 / 查询 / 片段里的空格不影响补全，由解析器编码：%s", (input, expected, href) => {
    expect(normalizeAddressInput(input)).toBe(expected);
    expect(new URL(expected).href).toBe(href);
  });

  it.each([
    ["//example.com/path", "https://example.com/path"],
    ["localhost.", "http://localhost."],
    ["127.0.0.1.", "http://127.0.0.1."],
  ])("协议相对地址与尾部点：%s", (input, expected) => {
    expect(normalizeAddressInput(input)).toBe(expected);
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
    "google.com is great",
    "example.com hello/world",
    "昔涟",
    "intranet",
    "1.5",
    "1.2.3",
    "0x7f.0.0.1",
    "user@example.com",
    "localhost:99999",
    "localhost:abc",
    "-bad-.com",
    "999.1.1.1",
    "[foo]:80",
    "[fe80::1%25eth0]",
  ])("认不出或解析器不接受的输入原样返回（不猜测、不拼搜索）：%j", (input) => {
    expect(normalizeAddressInput(input)).toBe(input);
  });
});
