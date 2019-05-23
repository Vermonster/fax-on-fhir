const Fs = require('fs');
const { SampleDocument } = require('./SampleDocument');


Fs.mkdirSync('./generated/pdf', { recursive: true });
Fs.mkdirSync('./generated/txt', { recursive: true });


const d = new SampleDocument({lab1_name: 'fooname'});




d.markdown().then((output) => {
  const wstream = Fs.createWriteStream('generated/txt/foo.txt');
  wstream.write(output);
  wstream.end();
});

d.pdf().then((output) => {
  const { pdf, browser } = output;
  const wstream = Fs.createWriteStream('generated/pdf/foo.pdf');
  wstream.write(pdf);
  wstream.end();
  browser.close();
});

console.log("Done");
