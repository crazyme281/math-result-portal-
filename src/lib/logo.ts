/**
 * Official university logo (University of Calabar).
 * Put the logo files in  public/logos/  named after the institution code, in PNG format:
 *     public/logos/unical.png
 * They are shown in the app header, at the top of every printed analysis page, and at the top of the PDF, Word and
 * Excel exports. If a file is missing the university name is shown on its own.
 */
export const logoUrl = (code: string) => `${import.meta.env.BASE_URL}logos/${code.toLowerCase()}.png`;

export interface Logo { dataUrl: string; bytes: Uint8Array; width: number; height: number }

/** Reads the logo file once and returns it ready for embedding in a PDF / Word / Excel file (null if not installed). */
export async function loadLogo(code: string): Promise<Logo | null> {
  try {
    const res = await fetch(logoUrl(code));
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const dataUrl = await new Promise<string>((ok, no) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.onerror = () => no(fr.error);
      fr.readAsDataURL(blob);
    });
    const size = await new Promise<{ w: number; h: number }>((ok, no) => {
      const im = new Image();
      im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => no(new Error('bad image'));
      im.src = dataUrl;
    });
    return { dataUrl, bytes, width: size.w, height: size.h };
  } catch {
    return null;
  }
}
