import { describe, expect, test } from "vitest";
import { UrlLock } from "../../src/server/url-lock.js";

describe("UrlLock", () => {
  test("serializes concurrent operations on the same key", async () => {
    const lock = new UrlLock();
    const order: string[] = [];
    const slow = async (name: string) => {
      order.push(`enter ${name}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`exit ${name}`);
    };
    await Promise.all([
      lock.run("u1", () => slow("a")),
      lock.run("u1", () => slow("b")),
      lock.run("u1", () => slow("c"))
    ]);
    expect(order).toEqual([
      "enter a",
      "exit a",
      "enter b",
      "exit b",
      "enter c",
      "exit c"
    ]);
  });

  test("does not block different keys", async () => {
    const lock = new UrlLock();
    const tasks: Array<Promise<number>> = [];
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      tasks.push(
        lock.run(`u${i}`, async () => {
          await new Promise((r) => setTimeout(r, 20));
          return i;
        })
      );
    }
    const results = await Promise.all(tasks);
    const elapsed = Date.now() - start;
    expect(results).toEqual([0, 1, 2, 3, 4]);
    // 5 parallel 20ms tasks should finish well under 5 * 20 = 100ms.
    expect(elapsed).toBeLessThan(80);
  });

  test("releases lock even when the task throws", async () => {
    const lock = new UrlLock();
    await expect(
      lock.run("u1", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await expect(lock.run("u1", async () => 42)).resolves.toBe(42);
  });
});
