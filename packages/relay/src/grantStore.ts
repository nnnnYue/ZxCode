import { randomBytes } from "node:crypto";

/**
 * 一次性短期票据存储：grant（手机接入，payload=attach target）与 attach ticket
 * （桌面回连，无 payload）共用语义 —— randomBytes(32)、TTL、一次性消费（重放即失效）、
 * 惰性过期清理。行为与 zcode-server-cli server-core 的 hostCapability 一致；
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
  /** 只读检查；不消费。 */
  peek(id: string | undefined): OneTimeTicket<Payload> | null;
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
