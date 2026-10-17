/**
 * 地址栏输入补全：用户手输 `google.com`、`localhost:3000` 这类不带协议的地址时补上协议。
 *
 * 只用于地址栏（BROWSER_PANEL_NAVIGATE）。Agent 浏览器工具仍要求完整 URL，不经过这里。
 * 补全后仍交给控制器的 http(s) 校验，因此 `file:`、`javascript:` 等协议照旧被拒绝；
 * 认不出的输入（普通文字、单段主机名、带用户信息的串）原样返回，由控制器给出原有错误码。
 *
 * 主机分类一律基于 WHATWG URL 解析后的规范主机名，而不是用户原文：
 * 八进制 / 补零 IPv4（`010.010.010.010` 实为 8.8.8.8）、IDN、全角字母都先由解析器规范化，
 * 再判断走 http 还是 https，避免「原文看着像内网、实际访问公网」的错配。
 */

const SCHEME_PREFIX = /^([a-z][a-z\d+.-]*):/i;
const HOST_PORT_REST = /^\d{1,5}(?:[/?#]|$)/;
/** 用户原文是四段纯数字（可带补零 / 尾点）才当 IP 补全，`1.5`、`0x7f.0.0.1` 这类不当地址。 */
const DOTTED_QUAD = /^\d+(?:\.\d+){3}\.?$/;
const CANONICAL_IPV4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
const DOMAIN_LABEL = /^[a-z\d_](?:[a-z\d_-]*[a-z\d_])?$/;
const TLD = /^(?:[a-z]{2,}|xn--[a-z\d-]+)$/;

export function normalizeAddressInput(input: string): string {
  let trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return input;
  // 协议相对地址 `//example.com/path`：按省略协议处理
  if (trimmed.startsWith("//")) trimmed = trimmed.slice(2);
  const candidate = normalizeAuthorityPunctuation(trimmed);

  // 已带协议（含 http/https 以外的协议）一律不动；`localhost:3000` 这类「主机:端口」不算协议
  const scheme = SCHEME_PREFIX.exec(candidate);
  if (scheme && !HOST_PORT_REST.test(candidate.slice(scheme[0].length))) return input;

  let url: URL;
  try {
    url = new URL(`http://${candidate}`);
  } catch {
    return input;
  }
  if (url.username || url.password) return input;

  const kind = classifyHost(url.hostname, candidate);
  if (kind === "local") return `http://${candidate}`;
  if (kind === "public") return `https://${candidate}`;
  return input;
}

/** 中文输入法下常见的全角句点 / 冒号，只在主机部分归一化，路径与查询保持原样。 */
function normalizeAuthorityPunctuation(value: string): string {
  const end = value.search(/[/?#]/);
  const authority = end === -1 ? value : value.slice(0, end);
  const rest = end === -1 ? "" : value.slice(end);
  return authority.replace(/[。．｡]/g, ".").replace(/：/g, ":") + rest;
}

type HostKind = "local" | "public" | null;

function classifyHost(hostname: string, candidate: string): HostKind {
  if (hostname.startsWith("[")) return classifyIpv6(hostname.slice(1, -1));
  const host = hostname.replace(/\.$/, "");
  const ipv4 = readCanonicalIpv4(host);
  if (ipv4) {
    const rawHost = candidate.split(/[/?#]/, 1)[0].replace(/:\d*$/, "");
    if (!DOTTED_QUAD.test(rawHost)) return null;
    return isLocalIpv4(ipv4) ? "local" : "public";
  }
  if (host === "localhost" || host.endsWith(".localhost")) return "local";
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => DOMAIN_LABEL.test(label))) return null;
  return TLD.test(labels[labels.length - 1]) ? "public" : null;
}

function readCanonicalIpv4(host: string): number[] | null {
  const match = CANONICAL_IPV4.exec(host);
  return match ? match.slice(1).map(Number) : null;
}

/** 本机与局域网地址默认走 http：本地开发服务器通常没有证书。 */
function isLocalIpv4([a, b]: number[]): boolean {
  return a === 127 || a === 10 || a === 0
    || (a === 192 && b === 168)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 169 && b === 254);
}

/** 解析器已把 IPv6 规范化（小写、压缩、内嵌 IPv4 转十六进制），这里只需展开成 8 组。 */
function classifyIpv6(address: string): HostKind {
  const hextets = expandIpv6(address);
  if (!hextets) return null;
  const [first] = hextets;
  const leadingZero = hextets.slice(0, 5).every((part) => part === 0);
  if (leadingZero && hextets[5] === 0xffff) {
    // IPv4 映射地址 ::ffff:a.b.c.d 按内嵌的 IPv4 判断
    const a = hextets[6] >> 8, b = hextets[6] & 0xff;
    return isLocalIpv4([a, b]) ? "local" : "public";
  }
  const unspecifiedOrLoopback = hextets.slice(0, 7).every((part) => part === 0) && hextets[7] <= 1;
  const linkLocal = (first & 0xffc0) === 0xfe80;
  const uniqueLocal = (first & 0xfe00) === 0xfc00;
  return unspecifiedOrLoopback || linkLocal || uniqueLocal ? "local" : "public";
}

function expandIpv6(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const parts = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (parts.length !== 8 || !parts.every((part) => /^[\da-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => parseInt(part, 16));
}
