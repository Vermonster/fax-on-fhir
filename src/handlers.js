const AWS = require('aws-sdk');
const multipart = require('parse-multipart');

exports.pdfUploadHandler = async (request, context, callback) => {
  console.log('Version 3:06')
  console.log(request.body);
  const file = await parseMultiPartFormData(request);
  console.log(file);
  await uploadToS3(file);
  //const text = ocrPDF(pdf);
  //await createComprehendJob(text, id);

  return {statusCode: 200, body: 'Repeat'}
}

exports.comprehendCompletionHandler = async (event, context, callback) => {
  const classification = await getComprehendResults(event);
  const pdf = await getPDF(event);
  const binaryResponse = await uploadFHIRBinary(pdf);
  await uploadFHIRDocumentReference(classification, binaryResponse);
}

const parseMultiPartFormData = (request) => {
  const boundary = multipart.getBoundary(request.headers['Content-Type']);

  const bodyBuffer = Buffer.from(request.body, 'utf-8');
  return multipart.Parse(bodyBuffer, boundary).find((field) => field.name === "Media");
}

const uploadToS3 = async (file) => {
  const s3 = new AWS.S3();

  console.log(file.data.toString());
  await s3.putObject({
    Bucket: process.env.S3_BUCKET_FOR_PDF,
    Key: file.filename,
    Body: file.data
  }).promise((err, data) => console.log(err, data))
}
