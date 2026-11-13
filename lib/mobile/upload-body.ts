import { isNativeMobile } from "@/lib/mobile/bridge";

/**
 * A file the page can upload from the mobile app.
 *
 * A file dropped from another app (Files, Photos) into the app's WebView is
 * backed by a temporary copy that the page can read but WebKit's network
 * process cannot: sent as is, the request reached the server without its
 * file and was refused (400), while the same file chosen with the file picker
 * went through. Reading the bytes in the page first gives the request a body
 * held in memory. Anywhere else, and for a blob already built in memory (a
 * compressed image), the file is sent unchanged.
 */
export async function sendableUpload(blob: Blob): Promise<Blob> {
  if (!(blob instanceof File) || !isNativeMobile()) return blob;
  return new File([await blob.arrayBuffer()], blob.name, {
    type: blob.type,
    lastModified: blob.lastModified,
  });
}
