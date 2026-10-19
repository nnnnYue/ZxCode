import { describe, expect, it } from "vitest";
import { createOneTimeTicketStore } from "../src/grantStore.js";

// fork 原 node:test 用例，vitest 全量接管后转为 vitest 断言，语义不变。

describe("one-time ticket store", () => {
  it("issue/peek/consume 遵循一次性语义", () => {
    let current = 1_000;
    const store = createOneTimeTicketStore<string>({
      ttlMs: 60_000,
      now: () => current,
      createTicket: () => `ticket-${current++}`,
    });
    const ticket = store.issue("payload-a");
    expect(ticket.payload).toBe("payload-a");

    expect(store.peek(ticket.id)).toBeTruthy();
    expect(store.consume(ticket.id)).toBeTruthy();
    // 一次性：重放（peek 与 consume）都失效。
    expect(store.peek(ticket.id)).toBeNull();
    expect(store.consume(ticket.id)).toBeNull();
    expect(store.consume(undefined)).toBeNull();
  });

  it("TTL 过期后消费失败且惰性清理", () => {
    let current = 5_000;
    const store = createOneTimeTicketStore<number>({
      ttlMs: 1_000,
      now: () => current,
      createTicket: () => `t-${current++}`,
    });
    const ticket = store.issue(42);
    current += 2_000;
    expect(store.peek(ticket.id)).toBeNull();
    expect(store.consume(ticket.id)).toBeNull();
  });

  it("不同票据互不影响；payload 随票据返回", () => {
    const store = createOneTimeTicketStore<{ id: number }>({
      ttlMs: 60_000,
      createTicket: (() => {
        let seq = 0;
        return () => `t-${seq++}`;
      })(),
    });
    const first = store.issue({ id: 1 });
    const second = store.issue({ id: 2 });
    const consumed = store.consume(second.id);
    expect(consumed).toBeTruthy();
    expect(consumed?.payload).toEqual({ id: 2 });
    expect(store.consume(first.id)).toBeTruthy();
  });
});
