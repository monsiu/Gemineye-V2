"use client";

import { useEffect } from "react";
import { initWebVitals } from "../lib/web-vitals";

export default function WebVitalsClient() {
  useEffect(() => {
    initWebVitals();
  }, []);

  return null;
}
