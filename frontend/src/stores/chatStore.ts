import { create } from 'zustand';

interface ChatStore {
  open: boolean;
  openChat: () => void;
  closeChat: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  open: false,
  openChat: () => set({ open: true }),
  closeChat: () => set({ open: false }),
}));
