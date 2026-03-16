import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useDispatch, useSelector } from "react-redux";
import { MessageVersions } from "../MessageVersions";
import * as interactionSlice from "../../../messages/messageInteractionsSlice";

// Mock Redux hooks
vi.mock("react-redux", () => ({
  useDispatch: vi.fn(),
  useSelector: vi.fn(),
}));

// Mock the slice
vi.mock("../../../messages/messageInteractionsSlice", async () => {
  const actual = await vi.importActual(
    "../../../messages/messageInteractionsSlice",
  );
  return {
    ...actual,
    switchVersion: vi.fn(),
    retryMessage: vi.fn(),
    selectCurrentVersionNumber: vi.fn(),
    selectTotalVersions: vi.fn(),
    selectVersionsLoading: vi.fn(),
    selectIsRetrying: vi.fn(),
  };
});

describe("MessageVersions Component", () => {
  const dispatch = vi.fn();
  const mockProps = {
    messageId: "msg123",
    conversationId: "conv456",
    totalVersions: 3,
    currentVersion: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useDispatch.mockReturnValue(dispatch);

    // Mock useSelector to execute the selector function
    useSelector.mockImplementation((selectorFn) => selectorFn({}));

    // Default selector returns for version 1 of 3
    vi.mocked(interactionSlice.selectCurrentVersionNumber).mockReturnValue(1);
    vi.mocked(interactionSlice.selectTotalVersions).mockReturnValue(3);
    vi.mocked(interactionSlice.selectVersionsLoading).mockReturnValue(false);
    vi.mocked(interactionSlice.selectIsRetrying).mockReturnValue(false);

    // Mock window.confirm
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  it("renders nothing if only one version", () => {
    vi.mocked(interactionSlice.selectTotalVersions).mockReturnValue(1);
    render(<MessageVersions {...mockProps} totalVersions={1} />);
    expect(screen.queryByText(/Version/i)).toBeNull();
  });

  it("renders version info and controls for multiple versions", () => {
    render(<MessageVersions {...mockProps} />);
    expect(screen.getByText(/Version 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Previous version/i)).toBeDisabled(); // On version 1
    expect(screen.getByTitle(/Next version/i)).toBeEnabled();
    expect(screen.getByText(/Regenerate/i)).toBeInTheDocument();
  });

  it("dispatches switchVersion when clicking next", () => {
    render(<MessageVersions {...mockProps} />);
    const nextBtn = screen.getByTitle(/Next version/i);

    fireEvent.click(nextBtn);

    expect(dispatch).toHaveBeenCalled();
    expect(interactionSlice.switchVersion).toHaveBeenCalledWith({
      messageId: "msg123",
      versionNumber: 2,
    });
  });

  it("dispatches retryMessage on regenerate click", () => {
    render(<MessageVersions {...mockProps} />);
    const regenBtn = screen.getByRole("button", { name: /Regenerate/i });

    fireEvent.click(regenBtn);

    expect(dispatch).toHaveBeenCalled();
    expect(interactionSlice.retryMessage).toHaveBeenCalledWith({
      messageId: "msg123",
      conversationId: "conv456",
    });
  });

  it("disables buttons while loading or retrying", () => {
    vi.mocked(interactionSlice.selectVersionsLoading).mockReturnValue(true);
    vi.mocked(interactionSlice.selectIsRetrying).mockReturnValue(true);
    vi.mocked(interactionSlice.selectCurrentVersionNumber).mockReturnValue(2);
    vi.mocked(interactionSlice.selectTotalVersions).mockReturnValue(3);

    render(<MessageVersions {...mockProps} />);
    expect(screen.getByTitle(/Next version/i)).toBeDisabled();
    expect(screen.getByTitle(/Previous version/i)).toBeDisabled();
    expect(screen.getByText(/Regenerating.../i)).toBeInTheDocument();
  });
});
