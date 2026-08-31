"use client";

import { Camera, ImagePlus, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type QrScanner from "qr-scanner";

import { walletAddressFromQrPayload } from "@/lib/wallet-qr";

type ScannerStatus = "starting" | "scanning" | "reading-image" | "found" | "error";

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (name === "NotAllowedError" || /permission|denied|notallowed/i.test(message)) {
    return "Camera access was denied. Allow camera access for this site in your phone settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || /camera not found|no camera/i.test(message)) {
    return "No camera was found on this device. You can choose a QR image instead.";
  }
  if (name === "NotReadableError" || name === "AbortError" || /could not start video source|notreadable/i.test(message)) {
    return "The camera is being used by another app. Close it there, then try again.";
  }
  return "The camera could not be opened. Check camera permission and try again.";
}

export function CameraQrScanner({ onScan, onClose }: { onScan: (address: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const onScanRef = useRef(onScan);
  const completedRef = useRef(false);
  const activeRef = useRef(true);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    activeRef.current = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return () => {
      activeRef.current = false;
    };
  }, []);

  const finish = useCallback((address: string) => {
    if (completedRef.current || !activeRef.current) return;
    completedRef.current = true;
    setStatus("found");
    setError("");
    navigator.vibrate?.(60);

    const scanner = scannerRef.current;
    scannerRef.current = null;
    scanner?.destroy();
    if (activeRef.current) onScanRef.current(address);
  }, []);

  const processPayload = useCallback((payload: string) => {
    const address = walletAddressFromQrPayload(payload);
    if (!address) {
      setError("This QR code is not a wallet address. Scan the QR shown on a wallet's Receive screen.");
      return false;
    }
    finish(address);
    return true;
  }, [finish]);

  useEffect(() => {
    let disposed = false;
    const videoElement = videoRef.current;
    completedRef.current = false;

    const startCamera = async () => {
      if (!window.isSecureContext) {
        setStatus("error");
        setError("Camera scanning requires a secure HTTPS connection.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError("Camera scanning is not available in this browser. Choose a QR image instead.");
        return;
      }

      let scanner: QrScanner | null = null;
      try {
        const { default: QrScannerClass } = await import("qr-scanner");
        if (disposed || !activeRef.current || !videoElement) return;
        scanner = new QrScannerClass(
          videoElement,
          (result) => processPayload(result.data),
          {
            preferredCamera: "environment",
            maxScansPerSecond: 10,
            returnDetailedScanResult: true,
          },
        );
        scanner.setInversionMode("both");
        scannerRef.current = scanner;
        await scanner.start();
        if (disposed || !activeRef.current) {
          scanner.destroy();
          return;
        }
        setStatus("scanning");
      } catch (caught) {
        if (disposed || !activeRef.current) return;
        if (scannerRef.current === scanner) scannerRef.current = null;
        scanner?.destroy();
        setStatus("error");
        setError(cameraErrorMessage(caught));
      }
    };

    void startCamera();
    return () => {
      disposed = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      scanner?.destroy();
      const stream = videoElement?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [processPayload, retryKey]);

  const scanImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setStatus("reading-image");
    setError("");
    const activeScanner = scannerRef.current;
    try {
      await activeScanner?.pause(true);
      const { default: QrScannerClass } = await import("qr-scanner");
      const result = await QrScannerClass.scanImage(file, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });
      if (!activeRef.current) return;
      if (!processPayload(result.data)) setStatus(activeScanner ? "scanning" : "error");
    } catch {
      if (!activeRef.current) return;
      setError("No wallet QR code was found in that image. Choose a clearer image and try again.");
      setStatus(activeScanner ? "scanning" : "error");
    } finally {
      input.value = "";
      if (activeRef.current && activeScanner && !completedRef.current) {
        void activeScanner.start().catch((caught) => {
          if (!activeRef.current) return;
          setStatus("error");
          setError(cameraErrorMessage(caught));
        });
      }
    }
  };

  const statusText = status === "starting"
    ? "Opening camera…"
    : status === "reading-image"
      ? "Reading QR image…"
      : status === "found"
        ? "Wallet address found"
        : status === "scanning"
          ? "Point the camera at the wallet QR code"
          : "Camera unavailable";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="QR code scanner"
      className="absolute inset-0 z-[100] flex flex-col bg-black px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white"
      onTouchStart={(event) => event.stopPropagation()}
    >
      <header className="flex items-center justify-between gap-4 py-2">
        <button type="button" onClick={onClose} aria-label="Close QR scanner" className="grid h-12 w-12 place-items-center rounded-full bg-[#242426]">
          <X className="h-6 w-6" />
        </button>
        <h2 className="text-xl font-semibold">Scan wallet QR</h2>
        <span className="h-12 w-12" aria-hidden="true" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-5">
        <div className="relative aspect-square w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#111113] shadow-[0_24px_80px_rgba(0,0,0,.75)]">
          <video ref={videoRef} aria-label="Live camera preview" autoPlay muted playsInline disablePictureInPicture className="absolute inset-0 h-full w-full object-cover" />
          {status === "starting" || status === "reading-image" ? <LoaderCircle className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-spin text-[#a295f3]" /> : null}
          <span className="pointer-events-none absolute left-6 top-6 h-12 w-12 rounded-tl-2xl border-l-4 border-t-4 border-[#a295f3]" />
          <span className="pointer-events-none absolute right-6 top-6 h-12 w-12 rounded-tr-2xl border-r-4 border-t-4 border-[#a295f3]" />
          <span className="pointer-events-none absolute bottom-6 left-6 h-12 w-12 rounded-bl-2xl border-b-4 border-l-4 border-[#a295f3]" />
          <span className="pointer-events-none absolute bottom-6 right-6 h-12 w-12 rounded-br-2xl border-b-4 border-r-4 border-[#a295f3]" />
          {status === "scanning" ? <span className="pointer-events-none absolute left-8 right-8 top-1/2 h-0.5 animate-pulse bg-[#35d59c] shadow-[0_0_18px_#35d59c]" /> : null}
        </div>

        <p role="status" aria-live="polite" className="mt-6 text-center text-base font-semibold">{statusText}</p>
        {error ? <p role="alert" className="mt-3 max-w-sm rounded-2xl bg-red-500/10 px-4 py-3 text-center text-sm leading-5 text-red-200">{error}</p> : <p className="mt-2 max-w-sm text-center text-sm leading-5 text-white/45">Scan the QR shown on the receiving wallet&apos;s Receive screen.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-13 items-center justify-center gap-2 rounded-full bg-[#242426] px-4 text-base font-semibold">
          <ImagePlus className="h-5 w-5" /> QR image
        </button>
        <button type="button" onClick={() => { setStatus("starting"); setError(""); setRetryKey((value) => value + 1); }} className="flex min-h-13 items-center justify-center gap-2 rounded-full bg-[#a295f3] px-4 text-base font-semibold text-black">
          <RefreshCw className="h-5 w-5" /> Retry camera
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" aria-label="Choose wallet QR image" className="sr-only text-base" onChange={(event) => void scanImage(event)} />
      <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-white/35"><Camera className="h-4 w-4" /> Camera access is used only while this scanner is open.</p>
    </div>
  );
}
