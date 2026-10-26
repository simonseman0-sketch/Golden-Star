V104 — QuickBooks PDF → Barcode Print

Added below existing IIF tool on Packing Desk index.html. Upload text-based PDFs exported from QuickBooks, verify extracted quantities/SKUs/barcode digits/prices and print clean invoices with Code 128 barcode graphics. Multiple PDF files supported. Download editable XLSX with embedded barcode images. Uses browser-loaded PDF.js, JsBarcode and ExcelJS (internet needed to load libraries). Runs locally; no Supabase changes. Does not create invoices.

IMPORTANT: Invoice line/total discrepancies BLOCK export. Account Total Balance is displayed separately as it may be a prior outstanding balance and should not block printing. Test with sample 91010.pdf: four rows total $288, account balance $6396. For a normal PDF with matching totals, confirm & export, physically scan barcodes and check printout.
