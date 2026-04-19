/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CopyButton } from "@workspace/ui/components/copy-button"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("CopyButton — clipboard happy path", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it("writes value to clipboard and fires onCopy callback", async () => {
    const onCopy = vi.fn()
    render(
      <CopyButton
        value="pnpm dlx create-helpbase"
        onCopy={onCopy}>
        Copy
      </CopyButton>,
    )
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "pnpm dlx create-helpbase",
      )
    })
    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledWith("pnpm dlx create-helpbase")
    })
  })

  it("transitions state to 'copied' then back to 'idle' after timeout", async () => {
    render(
      <CopyButton
        value="hello"
        copiedDuration={20}>
        Copy
      </CopyButton>,
    )
    const btn = screen.getByRole("button")
    fireEvent.click(btn)
    await waitFor(() => {
      expect(btn).toHaveAttribute("data-copy-state", "copied")
    })
    await waitFor(
      () => {
        expect(btn).toHaveAttribute("data-copy-state", "idle")
      },
      { timeout: 200 },
    )
  })

  it("swaps copiedLabel when state is 'copied'", async () => {
    render(
      <CopyButton
        value="hello"
        copiedLabel={<span>Copied!</span>}>
        Copy
      </CopyButton>,
    )
    const btn = screen.getByRole("button")
    expect(btn).toHaveTextContent("Copy")
    fireEvent.click(btn)
    await waitFor(() => {
      expect(btn).toHaveTextContent("Copied!")
    })
  })
})

describe("CopyButton — execCommand fallback", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    })
  })

  it("falls back to document.execCommand when clipboard API rejects", async () => {
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand
    const onCopy = vi.fn()
    render(
      <CopyButton
        value="fallback-value"
        onCopy={onCopy}>
        Copy
      </CopyButton>,
    )
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith("copy")
    })
    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledWith("fallback-value")
    })
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-copy-state",
      "copied",
    )
  })

  it("enters error state when execCommand returns false", async () => {
    document.execCommand = vi.fn().mockReturnValue(false)
    const onCopy = vi.fn()
    render(
      <CopyButton
        value="val"
        onCopy={onCopy}>
        Copy
      </CopyButton>,
    )
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveAttribute(
        "data-copy-state",
        "error",
      )
    })
    expect(onCopy).not.toHaveBeenCalled()
  })

  it("enters error state when execCommand itself throws", async () => {
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error("browser refused")
    })
    render(<CopyButton value="val">Copy</CopyButton>)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveAttribute(
        "data-copy-state",
        "error",
      )
    })
  })
})

describe("CopyButton — guards", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it("short-circuits when consumer calls preventDefault on onClick", async () => {
    const onCopy = vi.fn()
    render(
      <CopyButton
        value="blocked"
        onCopy={onCopy}
        onClick={(e) => e.preventDefault()}>
        Copy
      </CopyButton>,
    )
    fireEvent.click(screen.getByRole("button"))
    // Give any in-flight microtasks a chance to run.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
  })
})
