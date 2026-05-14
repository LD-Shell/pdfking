# PDFKing

A comprehensive, privacy-first, browser-based PDF utility suite.

PDFKing provides over 20 PDF manipulation tools designed to convert, edit, and manage documents entirely client-side. By leveraging WebAssembly and local browser capabilities, it ensures strict data privacy—files are processed on the device and never uploaded to external servers.

**Live Site:** [pdfking.net](https://pdfking.net)

## Key Features

* **Client-Side Processing:** Powered by WebAssembly (WASM) and local JavaScript. All document rendering, OCR, and modification occur strictly within the browser environment.
* **Comprehensive Toolset:** Capabilities include form filling, text extraction (OCR), merging, splitting, compression, password protection, digital signatures, and high-resolution image conversion.
* **Intelligent Form Handling:** Automatically detects interactive form fields within PDFs and renders them as native HTML elements (inputs, checkboxes, dropdowns) for accurate data entry and document flattening.

## Tech Stack & Architecture

* **Core Libraries:** `pdf.js` (Mozilla), `pdf-lib`, `Tesseract.js` (OCR)
* **Styling:** Tailwind CSS
* **Build Pipeline:** Node.js, `terser`, `html-minifier-terser`

## Build and Optimization Process

To ensure optimal performance and minimal load times, the deployed production code is heavily optimized. The custom Node build script (`build.js`) automates the following steps during the `npm run build` process:

1. **CSS Compilation:** Replaces the development Tailwind CDN with a pre-compiled, strictly purged local CSS file.
2. **Code Minification:** Aggressively compresses all HTML and JavaScript files using `terser` and `html-minifier-terser`, removing whitespace, comments, and redundant characters to reduce file size.
3. **Distribution:** Generates a clean, production-ready `/dist` directory designed specifically for seamless deployment.

*Note: For development, debugging, and review, the readable, un-minified source code is maintained in the root directory outside of the `/dist` folder.*

## Author

**Olanrewaju Daramola**

## License

&copy; 2026 Olanrewaju Daramola. All rights reserved. Built for privacy.