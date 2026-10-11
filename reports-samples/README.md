# Reports Samples

Exported report files (D6). All eight reports are present here as both PDF and XLSX,
generated from the live demo dataset (`npm run db:seed-demo`) using the desktop
exporters (exceljs + pdfmake).

```
reports-samples/
  collection-summary.pdf        collection-summary.xlsx
  billing-vs-collection.pdf     billing-vs-collection.xlsx
  revenue.pdf                   revenue.xlsx
  ar-aging.pdf                  ar-aging.xlsx
  overdue.pdf                   overdue.xlsx
  collector-performance.pdf     collector-performance.xlsx
  subscriber-master.pdf         subscriber-master.xlsx
  statement-of-account.pdf      statement-of-account.xlsx
```

To regenerate: load the demo dataset, then export each report from the **Reports**
screen (or call `GET /reports/:key/export`, which returns the report model the desktop
client renders to PDF/XLSX).

Report keys: `collection-summary`, `billing-vs-collection`, `revenue`, `ar-aging`,
`overdue`, `collector-performance`, `subscriber-master`, `statement-of-account`.
