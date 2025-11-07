/// <reference types="@cloudflare/workers-types" />

import { describe, it, expect, vi } from "vitest";
import { SessionDO } from "./index";

const mockDurableObjectState = (): DurableObjectState => {
  const store = new Map<string, any>();
  return {
    storage: {
      get: vi.fn(async (key: string) => store.get(key)),
      put: vi.fn(async (key: string, value: any) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => store.delete(key))
    }
  } as unknown as DurableObjectState;
};

describe("SessionDO", () => {
  it("should return null for a new session", async () => {
    const state = mockDurableObjectState();
    const session = new SessionDO(state);
    const request = new Request("https://session.internal/", { method: "GET" });
    const response = await session.fetch(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("should store and retrieve session data", async () => {
    const state = mockDurableObjectState();
    const session = new SessionDO(state);
    const data = { user: "test" };

    const postRequest = new Request("https://session.internal/", {
      method: "POST",
      body: JSON.stringify(data)
    });
    const postResponse = await session.fetch(postRequest);
    expect(postResponse.status).toBe(200);
    const stored = await postResponse.json();
    expect(stored.data).toEqual(data);

    const getRequest = new Request("https://session.internal/", { method: "GET" });
    const getResponse = await session.fetch(getRequest);
    expect(getResponse.status).toBe(200);
    const retrieved = await getResponse.json();
    expect(retrieved.data).toEqual(data);
  });

  it("should delete session data", async () => {
    const state = mockDurableObjectState();
    const session = new SessionDO(state);
    const data = { user: "test" };

    const postRequest = new Request("https://session.internal/", {
      method: "POST",
      body: JSON.stringify(data)
    });
    await session.fetch(postRequest);

    const deleteRequest = new Request("https://session.internal/", { method: "DELETE" });
    const deleteResponse = await session.fetch(deleteRequest);
    expect(deleteResponse.status).toBe(204);

    const getRequest = new Request("https://session.internal/", { method: "GET" });
    const getResponse = await session.fetch(getRequest);
    expect(await getResponse.json()).toBeNull();
  });

  it("should handle invalid JSON gracefully", async () => {
    const state = mockDurableObjectState();
    const session = new SessionDO(state);
    const request = new Request("https://session.internal/", {
      method: "POST",
      body: "invalid-json"
    });
    const response = await session.fetch(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({});
  });
});
