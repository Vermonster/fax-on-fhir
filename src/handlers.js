const AWS = require('aws-sdk');
const multipart = require('parse-multipart');

exports.pdfUploadHandler = async (request, context, callback) => {
  console.log(request.body);
  const requestBody = await parseMultiPartFormData(request);
  console.log(requestBody);
  //const pdf = requestBody.media;
  //const id = requestBody.FaxSid;
  //await uploadToS3(pdf, id);
  //const text = ocrPDF(pdf);
  //await createComprehendJob(text, id);

  callback({status: 200, body: 'OK'});
}

exports.comprehendCompletionHandler = async (event, context, callback) => {
  const classification = await getComprehendResults(event);
  const pdf = await getPDF(event);
  const binaryResponse = await uploadFHIRBinary(pdf);
  await uploadFHIRDocumentReference(classification, binaryResponse);

  callback();
}

const parseMultiPartFormData = (request) => {

  const boundary = multipart.getBoundary(request.headers['Content-Type']);

  return multipart.Parse(request.body, boundary);
}
