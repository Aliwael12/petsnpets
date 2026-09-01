/**
 * Forces Vercel's static dependency tracer (@vercel/nft) to bundle pdfkit's .cjs font
 * files, not just the .mjs ones — verified empirically (not from docs) that the
 * `functions.includeFiles` glob in vercel.json does not pick these up in this CLI version,
 * while the tracer *does* correctly follow ordinary static require() calls (that's how it
 * finds the .mjs files already). pdfkit resolves the actual font it needs at runtime via a
 * path built from a variable, which a static analyzer can't follow — this file exists
 * purely to give it literal, analyzable require() calls to the same files instead.
 *
 * Dead code deliberately: the `if (false)` means none of this ever executes. The tracer
 * works via AST-level static analysis of require()/import calls, not by running anything,
 * so the calls still get seen and their targets still get bundled regardless of reachability.
 */
export {};

if (false as boolean) {
  require('pdfkit/js/standard-fonts/Courier.cjs');
  require('pdfkit/js/standard-fonts/CourierBold.cjs');
  require('pdfkit/js/standard-fonts/CourierBoldOblique.cjs');
  require('pdfkit/js/standard-fonts/CourierOblique.cjs');
  require('pdfkit/js/standard-fonts/Helvetica.cjs');
  require('pdfkit/js/standard-fonts/HelveticaBold.cjs');
  require('pdfkit/js/standard-fonts/HelveticaBoldOblique.cjs');
  require('pdfkit/js/standard-fonts/HelveticaOblique.cjs');
  require('pdfkit/js/standard-fonts/Symbol.cjs');
  require('pdfkit/js/standard-fonts/TimesBold.cjs');
  require('pdfkit/js/standard-fonts/TimesBoldItalic.cjs');
  require('pdfkit/js/standard-fonts/TimesItalic.cjs');
  require('pdfkit/js/standard-fonts/TimesRoman.cjs');
  require('pdfkit/js/standard-fonts/ZapfDingbats.cjs');
}
