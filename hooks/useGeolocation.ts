"use client";

import { useEffect, useRef, useState } from "react";

export type UserLocation = { lat: number; lng: number; accuracy: number };

type Bounds = [[number, number], [number, number]];

function inside(bounds: Bounds, lat: number, lng: number) {
  return lat >= bounds[0][0] && lat <= bounds[1][0] && lng >= bounds[0][1] && lng <= bounds[1][1];
}

// Starts watching the position as soon as the page opens. Errors from that automatic
// start stay silent (e.g. permission previously denied); only a manual press reports them.
export function useGeolocation(bounds: Bounds) {
  const [tracking, setTracking] = useState(true);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const manualRef = useRef(false);
  const boundsRef = useRef(bounds);

  useEffect(() => {
    if (!tracking || !("geolocation" in navigator)) return;
    let first = true;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setError(null);
        setLocation(next);
        if (first) {
          first = false;
          if (manualRef.current || inside(boundsRef.current, next.lat, next.lng)) {
            setFocusToken((t) => t + 1);
          }
        }
      },
      (err) => {
        if (manualRef.current) {
          setError(
            err.code === err.PERMISSION_DENIED
              ? "ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์"
              : "ระบุตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง",
          );
        }
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]);

  const locate = () => {
    manualRef.current = true;
    if (tracking && location) {
      setFocusToken((t) => t + 1);
      return;
    }
    if (!("geolocation" in navigator)) {
      setError("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    setError(null);
    setTracking(true);
  };

  return { tracking, location, error, focusToken, locate };
}
