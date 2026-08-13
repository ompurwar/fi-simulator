"use client";

import { create } from "zustand";

export interface NotificationObj {
  id: string;
  title: string;
  desc?: string;
  variant: "dark-info" | "success" | "danger" | "warning" | "neutral";
  active?: boolean;
  dismissal?: string;
  time_based?: boolean;
  duration?: number;
  buttons?: { text: string; handler?: () => void }[];
  on_close?: () => void;
}

interface NotificationState {
  notifications: NotificationObj[];
  fire: (payload: Partial<NotificationObj> & { title: string }) => void;
  clearAll: () => void;
  remove: (id: string) => void;
}

let idCounter = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  fire: (payload) => {
    const id = `notif-${Date.now()}-${idCounter++}`;
    const notification: NotificationObj = {
      id,
      title: payload.title,
      desc: payload.desc,
      variant: payload.variant || "dark-info",
      active: true,
      time_based: payload.time_based ?? true,
      duration: payload.duration ?? 4000,
      buttons: payload.buttons,
      on_close: payload.on_close,
    };
    set((s) => ({ notifications: [...s.notifications, notification] }));
    if (notification.time_based && notification.duration) {
      setTimeout(() => get().remove(id), notification.duration);
    }
  },
  clearAll: () => set({ notifications: [] }),
  remove: (id) => {
    const notif = get().notifications.find((n) => n.id === id);
    if (notif?.on_close) notif.on_close();
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
  },
}));

/** Imperative helper mirroring the Vue `FireNotification` export. */
export function FireNotification(payload: Partial<NotificationObj> & { title: string }) {
  useNotificationStore.getState().fire(payload);
}
export function ClearAllNotifications() {
  useNotificationStore.getState().clearAll();
}
