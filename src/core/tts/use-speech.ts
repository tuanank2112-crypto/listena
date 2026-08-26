"use client";

import { useSyncExternalStore } from "react";
import { getSpeechState, subscribeSpeechState } from "./speech";

export function useSpeechState() {
  return useSyncExternalStore(subscribeSpeechState, getSpeechState, getSpeechState);
}
