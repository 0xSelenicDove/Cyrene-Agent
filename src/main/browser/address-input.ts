/**
 * 地址栏输入补全：用户手输 `google.com`、`localhost:3000` 这类不带协议的地址时补上协议。
 *
 * 只用于地址栏（BROWSER_PANEL_NAVIGATE）。Agent 浏览器工具仍要求完整 URL，不经过这里。
 * 补全后仍交给控制器的 http(s) 校验，因此 `file:`、`javascript:` 等协议照旧被拒绝；
 * 认不出的输入（普通文字、单段主机名、带 `@` 的串）原样返回，由控制器给出原有错误码。
 */

const SCHEME_PREFIX = /^([a-z][a-z\d+.-]*):/i;
const HOST_PORT_REST = /^\d{1,5}(?:[/?#]|$)/;
const DOMAIN = /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+\.?$/u;
const TLD = /^(?:\p{L}{2,}|xn--[a-z\d-]+)$/iu;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function normalizeAddressInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return input;

  // 已带协议（含 http/https 以外的协议）一律不动；`localhost:3000` 这类「主机:端口」不算协议
  const scheme = SCHEME_PREFIX.exec(trimmed);
  if (scheme && !HOST_PORT_REST.test(trimmed.slice(scheme[0].length))) return input;

  const authority = trimmed.split(/[/?#]/, 1)[0];
  const host = readHost(authority);
  if (host === null) return input;
  if (isLocalHost(host)) return `http://${trimmed}`;
  if (isPublicHost(host)) return `https://${trimmed}`;
  return input;
}

/** 从「主机[:端口]」中取出主机名；端口非法或含用户信息时返回 null。 */
function readHost(authority: string): string | null {
  if (!authority || authority.includes("@")) return null;
  const bracketed = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(authority);
  if (bracketed) return validPort(bracketed[2]) ? `[${bracketed[1].toLowerCase()}]` : null;
  const colon = authority.lastIndexOf(":");
  if (colon === -1) return authority.toLowerCase();
  return validPort(authority.slice(colon + 1)) ? authority.slice(0, colon).toLowerCase() : null;
}

function validPort(port: string | undefined): boolean {
  if (port === undefined) return true;
  if (!/^\d{1,5}$/.test(port)) return false;
  const value = Number(port);
  return value > 0 && value <= 65535;
}

/** 本机与局域网地址默认走 http：本地开发服务器通常没有证书。 */
function isLocalHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]") return true;
  const octets = readIpv4(host);
  if (!octets) return false;
  const [a, b] = octets;
  return a === 127 || a === 10 || a === 0
    || (a === 192 && b === 168)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 169 && b === 254);
}

function isPublicHost(host: string): boolean {
  if (readIpv4(host)) return true;
  if (!DOMAIN.test(host)) return false;
  const labels = host.replace(/\.$/, "").split(".");
  if (labels.some((label) => !label || label.startsWith("-") || label.endsWith("-"))) return false;
  return TLD.test(labels[labels.length - 1]);
}

function readIpv4(host: string): number[] | null {
  const match = IPV4.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}
