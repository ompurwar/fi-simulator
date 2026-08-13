"use client";

import { Howl } from "howler";

/** Port of common/sound.js — notification sounds. */
const SOUNDS = {
  access_allowed: new Howl({ src: ["/sounds/access-allowed.wav"] }),
  error: new Howl({ src: ["/sounds/error.wav"] }),
  notification: new Howl({ src: ["/sounds/notification.wav"] }),
};

export function PlaySound(name: keyof typeof SOUNDS) {
  try {
    SOUNDS[name]?.play();
  } catch {
    /* noop */
  }
}
