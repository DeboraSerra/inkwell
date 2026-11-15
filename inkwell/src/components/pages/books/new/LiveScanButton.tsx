"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cameraErrorMessage,
  NOT_A_BOOK,
  readLiveFrame,
  SCANNER_FAILED,
  shouldReadFrame,
} from "@/server/books/barcode.rules";
import { useEffect, useRef, useState } from "react";
import { prepareReader, readVideoFrame } from "./barcode-scan";

// The camera's video, read a few frames a second until a book's barcode shows.
// Mounted only while the dialog is open, so closing it in any way, finding a
// book, or leaving the page unmounts it and stops every camera track. Frames
// are read in the browser and dropped; nothing is recorded or uploaded.
function Viewfinder({
  onIsbn,
  onError,
}: Readonly<{ onIsbn: (isbn13: string) => void; onError: (message: string) => void }>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [seenProduct, setSeenProduct] = useState(false);
  // The latest callbacks, so a parent re-render never restarts the camera.
  const callbacks = useRef({ onIsbn, onError });
  callbacks.current = { onIsbn, onError };

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    let frame = 0;
    let lastReadAt = 0;
    let reading = false;
    const canvas = document.createElement("canvas");

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };

    const tick = (now: number) => {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (shouldReadFrame(now, lastReadAt, reading)) {
        reading = true;
        lastReadAt = now;
        readVideoFrame(video, canvas)
          .then((values) => {
            if (stopped) return;
            const result = readLiveFrame(values);
            if (result.kind === "book") {
              stop();
              callbacks.current.onIsbn(result.isbn13);
            } else if (result.kind === "product") {
              setSeenProduct(true);
            }
          })
          // A frame that can't be read is just skipped.
          .catch(() => undefined)
          .finally(() => {
            reading = false;
          });
      }
      frame = requestAnimationFrame(tick);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera on a phone; a laptop uses whichever it has.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (error) {
        if (!stopped) callbacks.current.onError(cameraErrorMessage(error instanceof Error ? error.name : undefined));
        return;
      }
      // Closed while the browser was still asking for permission.
      if (stopped) {
        stop();
        return;
      }
      try {
        await prepareReader();
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        frame = requestAnimationFrame(tick);
      } catch (error) {
        console.warn("Starting the live scanner failed", error);
        stop();
        callbacks.current.onError(SCANNER_FAILED);
      }
    };

    start();
    return stop;
  }, []);

  return (
    <div className='flex flex-col gap-3'>
      <div className='relative overflow-hidden rounded-lg bg-black'>
        {/* muted and playsInline let iPhones play the camera inline. */}
        <video ref={videoRef} muted playsInline className='aspect-[4/3] w-full object-cover' />
        {/* Where to hold the barcode. */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-[12%] top-1/2 h-1/3 -translate-y-1/2 rounded-md border-2 border-white/80'
        />
      </div>
      <p className='text-sm text-muted-foreground' role='status'>
        {seenProduct ? NOT_A_BOOK : "Hold the barcode inside the frame."}
      </p>
    </div>
  );
}

// Whether this browser can open a camera (HTTPS or localhost), so the
// "Scan live" menu item only shows where it works. Checked after mounting, so
// the server and the browser render the same.
export function useCameraSupported() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);
  return supported;
}

// The live scan dialog behind the "Scan live" menu item, which opens it. It
// lives outside the menu, so it stays open when the menu closes.
export function LiveScanButton({
  open,
  onOpenChange,
  onIsbn,
  onError,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIsbn: (isbn13: string) => void;
  onError: (message: string) => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Scan a barcode</DialogTitle>
          <DialogDescription>Point the camera at the barcode on the back of the book.</DialogDescription>
        </DialogHeader>
        {open && (
          <Viewfinder
            onIsbn={(isbn13) => {
              onOpenChange(false);
              onIsbn(isbn13);
            }}
            onError={(message) => {
              onOpenChange(false);
              onError(message);
            }}
          />
        )}
        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
