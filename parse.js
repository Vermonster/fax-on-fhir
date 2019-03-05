const fs = require('fs');
const pdfParse = require('pdf-parse');

const filePath = process.argv[2];
const dataBuffer = fs.readFileSync(filePath);

pdfParse(dataBuffer).then((data) => {
  process.stdout.write(data.text.replace(/[\n\r",]/g, ""));
});
