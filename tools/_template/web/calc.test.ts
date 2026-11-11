import { test } from "node:test";
import assert from "node:assert/strict";
import { example } from "./calc.ts";

test("example doubles its input", () => assert.equal(example(2), 4));
