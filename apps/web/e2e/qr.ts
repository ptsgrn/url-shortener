import jsQR from 'jsqr';
import { PNG } from 'pngjs';

/** The text a QR code PNG encodes, or `null` if none is found. */
export function decodeQr(png: Buffer): string | null {
	const { data, width, height } = PNG.sync.read(png);
	return jsQR(new Uint8ClampedArray(data), width, height)?.data ?? null;
}

/** Decodes a `data:image/png;base64,…` URL. */
export const decodeQrDataUrl = (url: string) => decodeQr(Buffer.from(url.split(',')[1], 'base64'));
