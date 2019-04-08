const AWS = require('aws-sdk')
const s3 = new AWS.S3();
const request = require('request');
const OCR = require('tesseract.js');
const fs = require('fs');
const tar = require('tar');
const imageMagick = require('gm').subClass({imageMagick: true});

exports.pdfUploadHandler = async (event, context, callback) => {
  console.log('Version 10:08')
  downloadFax(event);

  callback(null, "Success")
}

exports.comprehendCompletionHandler = async (event, context, callback) => {
  const s3Event = event.Records[0].s3;
  if (event.Records[0].s3.object.key.match('write_access_check_file.temp')) {
    return { statusCode: 200 }
  };
  const faxId = s3Event.object.key.match(/(.+)\/.+\/output/)[1];
  s3.getObject({
    Bucket: s3Event.bucket.name,
    Key: s3Event.object.key
  }, (err, data) => {
    fs.writeFileSync('/tmp/output.tar.gz', data.Body);
    tar.extract({ file: '/tmp/output.tar.gz', cwd: '/tmp/', sync: true });
    const output = fs.readFileSync('/tmp/predictions.jsonl')
    const docType = output.Classes.reduce((prev, curr) => {
      return (prev.Score > curr.Score) ? prev : curr
    }).Name

    s3.getObject({
      Bucket: process.env.S3_BUCKET_FOR_FAX,
      Key: faxId + '.tif'
    })

  });
  callback(null, "Success");
  //const classification = await getComprehendResults(event);
  //const pdf = await getFax(event);
  //const binaryResponse = await uploadFHIRBinary(pdf);
  //await uploadFHIRDocumentReference(classification, binaryResponse);
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
      if(err) { console.log(err) };
      OCR.recognize('/tmp/temp.jpg')
      .then((result) => {
        uploadToS3(result.text, bodyAttrs.FaxSid + '.txt', (err) => {
          if(err) { console.log(err) };
          const comprehend = new AWS.Comprehend();
          console.log(comprehend);
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
