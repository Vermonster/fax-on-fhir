const fs = require('fs');
const rimraf = require('rimraf');
const stringify = require('csv-stringify');
const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();
const Client = require('fhir-kit-client');
const { SampleDocument } = require('./SampleDocument');
const pMap = require('p-map');

/**
 * Utility function to flatten this structure:
 *
 * [ { use: 'official',
 *     family: 'Gutmann231',
 *     given: [ 'Rollin796' ],
 *     prefix: [ 'Mrs.' ] },
 *   { use: 'maiden', family: 'Bosco865', given: [ 'Rollin796' ] }
 * ]
 *
 * To a string without numbers in the name...
 */
function buildNameString(fhirNameElement) {
  const name = fhirNameElement.find((nameItem) => { return nameItem.use === 'official'});

  let patientName = '';
  if (name) {
    if (name.prefix) { patientName += name.prefix.join(' ') + ' '; }
    if (name.given) { patientName += name.given.join(' ') + ' '; }
    patientName += name.family;
  }

  return patientName.replace(/[0-9]*/g, '');
}

// Make a text representation of the report
function createTxt(report) {
  const output = entities.decode(report.markdown());
  csvAccumulator.push([report.kind, output]);
}

// Make a PDF representation of the report
function createPdf(report) {
  return report.pdf().then((output) => {
    const { pdf, browser } = output;
    const wstream = fs.createWriteStream(`generated/pdf/${report.kind}-${report.id}.pdf`);
    wstream.write(pdf);
    wstream.end();
    browser.close();
  });
}

// Create the pair of TXT and PDF of a lab report
async function createLabReport(patient, report, labs) {
  const labReport = new SampleDocument({patient, report, labs}, 'labs');
  console.log(`creating Lab Report ${labReport.id}`);
  createTxt(labReport);
  //await createPdf(labReport);
}

// Create the pair of TXT and PDF of a consent release form
async function createConsent(patient) {
  const consent = new SampleDocument({patient}, 'consent');
  createTxt(consent);
  //await createPdf(consent);
}

// Map job for pMap to run concurrently
const documentJob = async (entry) => {
  const { resource } = entry;

  let labs = [];

  if (resource.resourceType === 'DiagnosticReport') {
    const { result: observationRefs } = resource;

    for await (let observationRef of observationRefs) {
      const observation = await client.resolve({ reference: observationRef.reference, context: bundle });
      if (observation && observation.valueQuantity) {
        const { valueQuantity } = observation;

        labs.push({
          labName: observation.code.coding[0].display,
          labValue: valueQuantity.value,
          labUnit: valueQuantity.unit
        });
      }
    };

    const patient = await client.resolve({ reference: resource.subject.reference, context: bundle});

    if (patient && labs.length) {
      const dateOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }

      const reportPatient = {
        name: buildNameString(patient.name),
        gender: patient.gender,
        birthDate: (new Date(patient.birthDate)).toLocaleString('en-us', dateOptions)
      };
      const report = {
        name: resource.code.coding[0].display,
        physicianName: "Dr. Jean Valjean",
        physicianNpi: "24601",
        specimenDate: (new Date(resource.effectiveDateTime)).toLocaleString('en-us', dateOptions)
      };

      await createLabReport(reportPatient, report,  labs);
      await createConsent(reportPatient);
    }
  }
};


//
// Main function...
//
const client = new Client({ baseUrl: 'https://syntheticmass.mitre.org/fhir/' });
let bundle;
let csvAccumulator = [];

async function main() {
  // clean and ensure directories exist
  rimraf.sync('./generated');
  fs.mkdirSync('./generated', { recursive: true });
  fs.mkdirSync('./generated/pdf', { recursive: true });
  fs.mkdirSync('./generated/txt', { recursive: true });

  // Query FHIR server
  const client = new Client({ baseUrl: 'https://syntheticmass.mitre.org/fhir/' });
  bundle = await client.search({
    resourceType: 'DiagnosticReport',
    searchParams: {
      _include:  [ 'DiagnosticReport:patient' ]
    }
  });

  let { entry: entries } = bundle;
  let currentPage = bundle;
  let pageNumber = 1

  while(currentPage && pageNumber <= 10) {
    console.log('looking at next page: ', pageNumber);
    currentPage = await client.nextPage({ bundle: currentPage })
    entries = entries.concat(currentPage.entry);
    console.log(entries.length);
    pageNumber++;
  };

  bundle.entry = entries;

  const concurrency = 10;
  console.log(`starting job...`);
  const result = await pMap(entries, documentJob, { concurrency });
  stringify(csvAccumulator, (err, output) => {
    fs.writeFileSync('./generated/training-data.csv', output);
  });

  console.log(`...done`);
};

main();
