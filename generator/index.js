const fs = require('fs');
const rimraf = require('rimraf');
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
  report.markdown().then((output) => {
    const wstream = fs.createWriteStream(`generated/txt/${report.id}.txt`);
    wstream.write(output);
    wstream.end();
  });
}

// Make a PDF representation of the report
function createPdf(report) {
  return report.pdf().then((output) => {
    const { pdf, browser } = output;
    const wstream = fs.createWriteStream(`generated/pdf/${report.id}.pdf`);
    wstream.write(pdf);
    wstream.end();
    browser.close();
  });
}

// Create the pair of TXT and PDF of a lab report
async function createLabReport(patient, doctorName, reportName, labs) {
  const labReport = new SampleDocument({patient, doctorName, reportName, labs}, 'labs');
  createTxt(labReport);
  await createPdf(labReport);
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
      const reportPatient = {
        name: buildNameString(patient.name),
        gender: patient.gender,
        birthDate: patient.birthDate
      };
      await createLabReport(reportPatient, "Dr. House", resource.code.coding[0].display, labs);
    }
  }
};


//
// Main function...
//


const client = new Client({ baseUrl: 'https://syntheticmass.mitre.org/fhir/' });

let bundle;

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

  const { entry: entries } = bundle;

  const number = entries.length;
  const concurrency = 10;

  console.log(`generating ${number} reports with concurrency ${concurrency}`);
  const result = await pMap(entries, documentJob, { concurrency });

  console.log(`done`);
};

main();
