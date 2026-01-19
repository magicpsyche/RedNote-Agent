import { create } from "zustand";

import type {
  AppStatus,
  CopyResult,
  LayoutConfig,
  ProductInput,
  VisualStrategy,
} from "@/types/schema";

type AppStore = {
  status: AppStatus;
  input: ProductInput | null;
  copyResult: CopyResult | null;
  visualStrategy: VisualStrategy | null;
  layoutConfig: LayoutConfig | null;
  backgroundImagePreview: string | null;
  error: string | null;
  setStatus: (status: AppStatus) => void;
  setInput: (payload: ProductInput | null) => void;
  setCopyResult: (payload: CopyResult | null) => void;
  setVisualStrategy: (payload: VisualStrategy | null) => void;
  setLayoutConfig: (payload: LayoutConfig | null) => void;
  setBackgroundImagePreview: (payload: string | null) => void;
  setError: (message: string | null) => void;
  reset: () => void;
};

const initialState = {
  status: "IDLE" as AppStatus,
  input: null,
  copyResult: null,
  visualStrategy: null,
  layoutConfig: null,
  backgroundImagePreview: null,
  error: null,
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setInput: (payload) => set({ input: payload }),
  setCopyResult: (payload) => set({ copyResult: payload }),
  setVisualStrategy: (payload) => set({ visualStrategy: payload }),
  setLayoutConfig: (payload) => set({ layoutConfig: payload }),
  setBackgroundImagePreview: (payload) => set({ backgroundImagePreview: payload }),
  setError: (message) => set({ error: message }),
  reset: () => set(initialState),
}));
