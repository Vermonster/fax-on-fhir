const AWS = require('aws-sdk')
const s3 = new AWS.S3();
const request = require('request');
const OCR = require('tesseract.js');
const fs = require('fs');
const tar = require('tar');
const imageMagick = require('gm').subClass({imageMagick: true});
const fhirKitClient = require('fhir-kit-client');

exports.faxUploadHandler = async (event, context, callback) => {
  downloadFax(event);

  callback(null, "Success")
}

exports.comprehendCompletionHandler = async (event, context, callback) => {
  const s3Event = event.Records[0].s3;
  if (event.Records[0].s3.object.key.match('write_access_check_file.temp')) {
    return { statusCode: 200 }
  };
  const faxId = s3Event.object.key.match(/(.+?)\/.+\/output/)[1];
  s3.getObject({
    Bucket: s3Event.bucket.name,
    Key: s3Event.object.key
  }, (err, data) => {
    const docType = getTypeFromTarData(data.Body);

    uploadToFHIR(faxId, docType);
  });

  callback(null, "Success");
}

const getTypeFromTarData = (tarData) => {
  fs.writeFileSync('/tmp/output.tar.gz', tarData);
  tar.extract({ file: '/tmp/output.tar.gz', cwd: '/tmp/', sync: true });
  const output = JSON.parse(fs.readFileSync('/tmp/predictions.jsonl').toString());
  const docType = output.Classes.reduce((prev, curr) => {
    return (prev.Score > curr.Score) ? prev : curr
  }).Name;

  return docType;
}

const uploadToFHIR = (faxId, type) => {
  s3.getObject({
    Bucket: process.env.S3_BUCKET_FOR_FAX,
    Key: faxId + '.tif'
  }, (err, data) => {
    const client = new fhirKitClient({
      baseUrl: process.env.FHIR_SERVER_BASE_URL
    });

    createBinary(client, data.Body.toString('base64')).then((res) => {
      console.log(res);
      const binaryUrl = `${process.env.FHIR_SERVER_BASE_URL}Binary/${res.id}`;
      createDocumentReference(client, type, binaryUrl);
    });
  })
}

const createBinary = (client, data) => {
  return client.create({
    resourceType: 'Binary',
    body: {
      contentType: 'image/tiff',
      data: data
    }
  })
}

const createDocumentReference = (client, type, binaryUrl) => {
  client.create({
    resourceType: 'DocumentReference',
    body: {
      resourceType: 'DocumentReference',
      status: 'current',
      type: { coding: [{ code: type, system: 'http://example.com' }] },
      content: {
        attachment: { url: binaryUrl }
      }
    }
  }).catch((err) => console.log(err.response.data)).then((res) => { console.log(res) });
}

const downloadFax = async (event) => {
  const bodyAttrs = {};

  event.body.split('&').forEach((attrStr) => {
    let attrPair = attrStr.split('=');
    bodyAttrs[attrPair[0]] = decodeURIComponent(attrPair[1])
  })

  const faxUrl = bodyAttrs.MediaUrl;

  request.get({ uri: faxUrl, encoding: null }, async (err, resp, body) => {
    const filename = bodyAttrs.FaxSid + '.tif';
    uploadToS3(body, filename);
    ocrText(body, filename, bodyAttrs.FaxSid);
  })
}

const ocrText = (rawFile, filename, faxId) => {
  fs.writeFileSync('/tmp/' + filename, rawFile);
  imageMagick('/tmp/' + filename).write('/tmp/temp.jpg', (err) => {
    if(err) { "imageMagick Error:", console.log(err) };
    console.log('starting OCR');
    OCR.recognize('/tmp/temp.jpg')
    .then((result) => {
      startClassifierJob(result.text, faxId);
      startMedicalComprehendJob(result.text, faxId);
    });
  })
}

const startClassifierJob = (text, faxId) => {
  uploadToS3(text, faxId + '.txt', (err) => {
    if(err) { console.log(err) };
    const comprehend = new AWS.Comprehend();
    comprehend.startDocumentClassificationJob({
      DataAccessRoleArn: process.env.CLASSIFIER_ROLE_ARN,
      DocumentClassifierArn: process.env.CLASSIFIER_ARN,
      InputDataConfig: {
        S3Uri: `s3://${process.env.S3_BUCKET_FOR_FAX}/${faxId}.txt`,
        InputFormat: 'ONE_DOC_PER_FILE'
      },
      OutputDataConfig: {
        S3Uri: `s3://${process.env.S3_BUCKET_FOR_COMPREHEND_RESULTS}/${faxId}`
      }
    }, (err, data) => console.log(err, data));
  });
}

const startMedicalComprehendJob = (text, faxId) => {
  const comprehendMedical = new AWS.ComprehendMedical();
  comprehendMedical.detectEntities({ Text: text }, (err, data) => {
    if(err) { console.log(err) };
    console.log(data);
    uploadToS3(data, faxId + '-medical-entities.txt', (err) => {
      if(err) { console.log(err) };
    });
  });
}

const uploadToS3 = async (file, filename, callback = (err, data) => console.log(err, data)) => {
  console.log(`Uploading ${filename}`);
  s3.putObject({
    Bucket: process.env.S3_BUCKET_FOR_FAX,
    Key: filename,
    Body: file
  }, callback);
}
