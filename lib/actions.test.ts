import { describe, expect, test } from "bun:test";
import { rankSearchStores } from "./actions";

describe("rankSearchStores", () => {
  test("puts an exact verified-name match ahead of discovery results", () => {
    const stores = [
      { store_id: "1", name: "Torchy's Tacos" },
      { store_id: "2", name: "Local Foods -- 2nd Street District", verified_name: "Local Foods" },
      { store_id: "3", name: "Veracruz All Natural" },
    ];

    expect(rankSearchStores("Local Foods", stores).map((store) => store.store_id)).toEqual([
      "2",
      "1",
      "3",
    ]);
  });

  test("ranks phrase and word matches without disturbing equal-rank results", () => {
    const stores = [
      { store_id: "1", name: "Unrelated first" },
      { store_id: "2", name: "Austin Local Foods Cafe" },
      { store_id: "3", name: "Local Market and Foods" },
      { store_id: "4", name: "Unrelated second" },
    ];

    expect(rankSearchStores("local foods", stores).map((store) => store.store_id)).toEqual([
      "2",
      "3",
      "1",
      "4",
    ]);
  });

  test("normalizes punctuation, accents, and ampersands", () => {
    const stores = [
      { store_id: "1", name: "Other" },
      { store_id: "2", name: "Café Fish & Chips" },
    ];

    expect(rankSearchStores("cafe fish and chips", stores)[0]?.store_id).toBe("2");
  });
});
