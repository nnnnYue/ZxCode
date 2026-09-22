import assert from "node:assert/strict";
import test from "node:test";
import { createOneTimeTicketStore } from "../src/grantStore.js";

test("issue/peek/consume 遵循一次性语义", () => {
  let current = 1_000;
  const store = createOneTimeTicketStore<string>({
    ttlMs: 60_000,
    now: () => current,
    createTicket: () => `ticket-${current++}`,
  });
  const ticket = store.issue("payload-a");
  assert.equal(ticket.payload, "payload-a");

  assert.ok(store.peek(ticket.id));
  assert.ok(store.consume(ticket.id));
  // 一次性：重放（peek 与 consume）都失效。
  assert.equal(store.peek(ticket.id), null);
  assert.equal(store.consume(ticket.id), null);
  assert.equal(store.consume(undefined), null);
});

test("TTL 过期后消费失败且惰性清理", () => {
  let current = 5_000;
  const store = createOneTimeTicketStore<number>({
    ttlMs: 1_000,
    now: () => current,
    createTicket: () => `t-${current++}`,
  });
  const ticket = store.issue(42);
  current += 2_000;
  assert.equal(store.peek(ticket.id), null);
  assert.equal(store.consume(ticket.id), null);
});

test("不同票据互不影响；payload 随票据返回", () => {
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
  assert.ok(consumed);
  assert.deepEqual(consumed.payload, { id: 2 });
  assert.ok(store.consume(first.id));
});
