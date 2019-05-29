const Fs = require('fs');
const Path = require('path');
const Util = require('util');
const Puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const ReadFile = Util.promisify(Fs.readFile);
const Mustache = require('mustache');

const MarkdownIt = require('markdown-it');

const { execSync } = require('child_process');

const styles = `
html {
  font-family: sans-serif;
  margin: .5in;
}

table {
  width: 100%;
  border: 1px solid #ddd;
}
tr td {
  font-family: monospace;
}`;

class SampleDocument {
  constructor(data = {}, kind = 'labs') {
    this.data = data;
    this.kind = kind;
    this.id = Math.random().toString(36).substring(2, 15);
  }

  markdown() {
    const templatePath = Path.resolve('templates', `${this.kind}.md.template`);
    const template = Fs.readFileSync(templatePath, 'utf8');
    return Mustache.render(template, this.data);
  }

  async html() {
    const content = await this.markdown();
    const md = new MarkdownIt();
    return `<html><style>${styles}</style><body>${md.render(content)}</body></html>`;
  }

  async pdf() {
    const html = await this.html();
    const browser = await Puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    await page.emulateMedia('screen');

    const pdf = await page.pdf();
    return { pdf, browser };
  }
}

module.exports = { SampleDocument };
