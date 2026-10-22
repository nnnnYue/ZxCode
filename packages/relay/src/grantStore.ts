import { randomBytes } from "node:crypto";

/**
 * 票据存储：grant（手机接入，payload=attach target）与 attach ticket
 * （桌面回连，无 payload）共用实现 —— randomBytes(32)、TTL、惰性过期清理。
 * 两者的消费语义不同：attach ticket 仍一次性消费（consume，重放即失效）；
 * grant 自"链接即凭证"产品决策起不再消费，走 peek 校验 + touch 续期
 * （每次手机 WS 建立/断开把 TTL 从当前时刻重算），只在超时后失效。
 * 行为与 zcode-server-cli server-core 的 hostCapability 一致；
 * relay 不依赖 @zcode/services/@zcode/rpc，因此保留等价实现。
 */
export interface OneTimeTicketStoreOptions {
  ttlMs: number;
  now?: () => number;
  createTicket?: () => string;
}

export interface OneTimeTicket<Payload> {
  id: string;
  expiresAt: number;
  payload: Payload;
}

export interface OneTimeTicketStore<Payload> {
  issue(payload: Payload): OneTimeTicket<Payload>;
  /** 只读检查；不消费、不续期。 */
  peek(id: string | undefined): OneTimeTicket<Payload> | null;
  /**
   * 续期：仅当票据存在且未过期时，把 expiresAt 重算为 now + ttlMs 并返回票据；
   * 已过期/未知票据返回 null，不允许借续期复活。grant 用它实现闲置超时语义。
   */
  touch(id: string | undefined, ttlMs: number): OneTimeTicket<Payload> | null;
  /** 消费票据；只有首次且 TTL 内的消费返回票据本身（含 payload）。 */
  consume(id: string | undefined): OneTimeTicket<Payload> | null;
}

interface StoredTicket<Payload> {
  expiresAt: number;
  payload: Payload;
}

export function createOneTimeTicketStore<Payload>(
  options: OneTimeTicketStoreOptions,
): OneTimeTicketStore<Payload> {
  const now = options.now ?? Date.now;
  const createTicket = options.createTicket ?? (() => randomBytes(32).toString("base64url"));
  const storedById = new Map<string, StoredTicket<Payload>>();

  const purgeExpired = (at: number): void => {
    for (const [id, ticket] of storedById) {
      if (ticket.expiresAt <= at) storedById.delete(id);
    }
  };

  return {
    issue(payload) {
      const issuedAt = now();
      purgeExpired(issuedAt);
      const id = createTicket();
      const expiresAt = issuedAt + options.ttlMs;
      storedById.set(id, { expiresAt, payload });
      return { id, expiresAt, payload };
    },
    peek(id) {
      if (!id) return null;
      const ticket = storedById.get(id);
      if (!ticket || ticket.expiresAt <= now()) return null;
      return { id, expiresAt: ticket.expiresAt, payload: ticket.payload };
    },
    touch(id, ttlMs) {
      if (!id) return null;
      const touchedAt = now();
      const stored = storedById.get(id);
      // 过期票据不允许续期复活：闲置超时后的链接必须重新扫码签发。
      if (!stored || stored.expiresAt <= touchedAt) return null;
      stored.expiresAt = touchedAt + ttlMs;
      return { id, expiresAt: stored.expiresAt, payload: stored.payload };
    },
    consume(id) {
      if (!id) return null;
      const consumedAt = now();
      const ticket = storedById.get(id);
      // 无论成功、过期还是重放都先删除：只有首次且 TTL 内的消费生效，
      // 避免可重放的长期提权声明（grant 泄漏后也不能被二次使用）。
      storedById.delete(id);
      purgeExpired(consumedAt);
      if (!ticket || ticket.expiresAt <= consumedAt) return null;
      return { id, expiresAt: ticket.expiresAt, payload: ticket.payload };
    },
  };
}
