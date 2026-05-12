import { describe, expect, test } from "vitest";
import { getExitCodeForErrorCode } from "../../src/errors/exit-codes.js";

describe("getExitCodeForErrorCode", () => {
  test("maps URL errors to exit code 2", () => {
    expect(getExitCodeForErrorCode("INVALID_URL")).toBe(2);
    expect(getExitCodeForErrorCode("UNSUPPORTED_URL")).toBe(2);
    expect(getExitCodeForErrorCode("INVALID_OPTIONS")).toBe(2);
  });

  test("maps fetch and content errors to exit code 3", () => {
    expect(getExitCodeForErrorCode("FETCH_FAILED")).toBe(3);
    expect(getExitCodeForErrorCode("CONTENT_TOO_SHORT")).toBe(3);
  });

  test("maps LLM and Obsidian errors to dedicated exit codes", () => {
    expect(getExitCodeForErrorCode("LLM_OUTPUT_INVALID")).toBe(4);
    expect(getExitCodeForErrorCode("OBSIDIAN_CONFIG_MISSING")).toBe(5);
    expect(getExitCodeForErrorCode("OBSIDIAN_WRITE_FAILED")).toBe(5);
  });

  test("maps OSS errors to exit code 6", () => {
    expect(getExitCodeForErrorCode("OSS_CONFIG_INVALID")).toBe(6);
    expect(getExitCodeForErrorCode("OSS_UPLOAD_FAILED")).toBe(6);
  });

  test("maps local service errors to exit code 7", () => {
    expect(getExitCodeForErrorCode("HTTP_SERVER_FAILED")).toBe(7);
    expect(getExitCodeForErrorCode("SETTINGS_UPDATE_FAILED")).toBe(7);
  });

  test("maps unknown errors to exit code 1", () => {
    expect(getExitCodeForErrorCode("UNKNOWN_ERROR")).toBe(1);
  });
});
