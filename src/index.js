const AWS = require('aws-sdk');

exports.pdfUploadHandler = async (request, context, callback) => {
  const requestBody = await parseMultiPartFormData(request.body);
  const pdf = requestBody.media;
  const id = requestBody.FaxSid;
  await uploadToS3(pdf, id);
  const text = ocrPDF(pdf);
  await createComprehendJob(text, id);

  callback();
}

exports.comprehendCompletionHandler = async (event, context, callback) => {
  const classification = await getComprehendResults(event);
  const pdf = await getPDF(event);
  const binaryResponse = await uploadFHIRBinary(pdf);
  await uploadFHIRDocumentReference(classification, binaryResponse);

  callback();
}
