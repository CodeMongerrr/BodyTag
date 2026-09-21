import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import font from "dejavu-fonts-ttf/ttf/DejaVuSans.ttf";

// The SVG builders in @bodytag/shared/images-svg use font-family "BodyTag Sans"; resvg maps every
// family it cannot find to defaultFontFamily, so one bundled TTF covers all the text.
export const FONT_FAMILY = "BodyTag Sans";

let ready: Promise<void> | undefined;
const fontBytes = new Uint8Array(font);

/** initWasm may only run once per isolate; later calls throw, so the promise is cached. */
function ensureWasm() {
  if (!ready) ready = initWasm(wasm);
  return ready;
}

/** Rasterise an SVG document at its declared size and return PNG bytes. */
export async function renderPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    font: { fontBuffers: [fontBytes], defaultFontFamily: FONT_FAMILY, sansSerifFamily: FONT_FAMILY, monospaceFamily: FONT_FAMILY },
    fitTo: { mode: "original" },
  });
  try {
    const image = resvg.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}
