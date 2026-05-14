# PDFKing

A comprehensive, privacy-first, browser-based PDF utility suite.

PDFKing provides over 15 PDF manipulation tools designed to convert, edit, and manage documents entirely client-side. It ensures strict data privacy—files are processed on the device and never uploaded to external servers by leveraging WebAssembly and local browser capabilities.

**Live Site:** [pdfking.net](https://pdfking.net)

## Tech Stack & Architecture

* **Core Libraries:** `pdf.js` (Mozilla), `pdf-lib`, `Tesseract.js` (OCR)
* **Styling:** Tailwind CSS
* **Build Pipeline:** Node.js, `terser`, `html-minifier-terser`

## Build and Optimization Process

1. **CSS Compilation:** Replaces the development Tailwind CDN with a pre-compiled, strictly purged local CSS file.
2. **Code Minification:** Compresses all HTML and JavaScript files using `terser` and `html-minifier-terser` to reduce file size.
   
## Author

**Olanrewaju Daramola**

## License

&copy; 2026 Olanrewaju Daramola. All rights reserved. Built for privacy.
