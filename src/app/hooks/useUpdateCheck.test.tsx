// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateCheck } from "./useUpdateCheck";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke
}));

describe("useUpdateCheck", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it("shows updateAvailable when backend reports a newer release", async () => {
    mocks.invoke.mockResolvedValue({
      current_version: "0.11.0-beta.4",
      latest_version: "0.11.0-beta.5",
      update_available: true,
      release_url: "https://github.com/lrk7353-arch/CodeReader/releases/tag/v0.11.0-beta.5",
      release_name: "CodeReader 0.11.0 beta 5"
    });
    let latest: ReturnType<typeof useUpdateCheck> | undefined;

    function Probe() {
      latest = useUpdateCheck();
      return null;
    }

    render(<Probe />);

    await act(async () => {
      await current(latest).check();
    });

    await waitFor(() => {
      expect(current(latest).state).toEqual({
        status: "updateAvailable",
        currentVersion: "0.11.0-beta.4",
        latestVersion: "0.11.0-beta.5",
        releaseUrl: "https://github.com/lrk7353-arch/CodeReader/releases/tag/v0.11.0-beta.5",
        releaseName: "CodeReader 0.11.0 beta 5"
      });
    });
    expect(mocks.invoke).toHaveBeenCalledWith("check_for_updates");
  });

  it("shows unavailable when backend rejects", async () => {
    mocks.invoke.mockRejectedValue(new Error("network"));
    let latest: ReturnType<typeof useUpdateCheck> | undefined;

    function Probe() {
      latest = useUpdateCheck();
      return null;
    }

    render(<Probe />);

    await act(async () => {
      await current(latest).check();
    });

    await waitFor(() => {
      expect(current(latest).state).toEqual({
        status: "unavailable",
        message: "network"
      });
    });
  });
});

function current(api: ReturnType<typeof useUpdateCheck> | undefined) {
  if (!api) {
    throw new Error("update check probe did not render");
  }
  return api;
}
