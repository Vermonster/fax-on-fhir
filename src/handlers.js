const AWS = require('aws-sdk')
const s3 = new AWS.S3();
const request = require('request');
const OCR = require('tesseract.js');
const fs = require('fs');
const tar = require('tar');
const imageMagick = require('gm').subClass({imageMagick: true});
const fhirKitClient = require('fhir-kit-client');

exports.pdfUploadHandler = async (event, context, callback) => {
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
    fs.writeFileSync('/tmp/output.tar.gz', data.Body);
    tar.extract({ file: '/tmp/output.tar.gz', cwd: '/tmp/', sync: true });
    const output = JSON.parse(fs.readFileSync('/tmp/predictions.jsonl').toString());
    const docType = output.Classes.reduce((prev, curr) => {
      return (prev.Score > curr.Score) ? prev : curr
    }).Name

    s3.getObject({
      Bucket: process.env.S3_BUCKET_FOR_FAX,
      Key: faxId + '.tif'
    }, (err, data) => {
      const Client = new fhirKitClient({
        baseUrl: process.env.FHIR_SERVER_BASE_URL
      });

      Client.create({
        resourceType: 'Binary',
        body: {
          contentType: 'image/tiff',
          data: data.Body.toString('base64')
        }
      }).then((res) => {
        const binaryUrl = res.issue[0].diagnostics.match(/"(.+)"/)[1]
        Client.create({
          resourceType: 'DocumentReference',
          body: {
            resourceType: 'DocumentReference',
            status: 'current',
            type: { coding: [{ code: docType, system: 'http://example.com' }] },
            content: {
              attachment: { url: binaryUrl }
            }
          }
        }).catch((err) => console.log(err.response.data)).then((res) => { console.log(res) });
      });
    })

  });
  callback(null, "Success");
}

const downloadFax = async (event) => {
  const bodyAttrs = {};

  event.body.split('&').forEach((attrStr) => {
    let attrPair = attrStr.split('=');
    bodyAttrs[attrPair[0]] = decodeURIComponent(attrPair[1])
  })

  const pdfUrl = bodyAttrs.MediaUrl;

  request.get({ uri: pdfUrl, encoding: null }, async (err, resp, body) => {
    const filename = bodyAttrs.FaxSid + '.tif';
    uploadToS3(body, filename);

    fs.writeFileSync('/tmp/' + filename, body);
    imageMagick('/tmp/' + filename).write('/tmp/temp.jpg', (err) => {
      if(err) { "imageMagick Error:", console.log(err) };
      console.log(require('child_process').spawnSync('ls', ['/tmp/']).output[1].toString());
      console.log('starting OCR');
      OCR.recognize('/tmp/temp.jpg')
      .then((result) => {
        uploadToS3(result.text, bodyAttrs.FaxSid + '.txt', (err) => {
          if(err) { console.log(err) };
          const comprehend = new AWS.Comprehend();
          comprehend.startDocumentClassificationJob({
            DataAccessRoleArn: process.env.CLASSIFIER_ROLE_ARN,
            DocumentClassifierArn: process.env.CLASSIFIER_ARN,
            InputDataConfig: {
              S3Uri: `s3://${process.env.S3_BUCKET_FOR_FAX}/${bodyAttrs.FaxSid}.txt`,
              InputFormat: 'ONE_DOC_PER_FILE'
            },
            OutputDataConfig: {
              S3Uri: `s3://${process.env.S3_BUCKET_FOR_COMPREHEND_RESULTS}/${bodyAttrs.FaxSid}`
            }
          }, (err, data) => console.log(err, data));
        });
      });
    });

    return body;
  })
}

const uploadToS3 = async (file, filename, callback = (err, data) => console.log(err, data)) => {
  console.log(`Uploading ${filename}`);
  s3.putObject({
    Bucket: process.env.S3_BUCKET_FOR_FAX,
    Key: filename,
    Body: file
  }, callback);
}