# Fax-On-Fhir

This repository is a proof of concept, demonstrating a serverless workflow that may be used to parse data from faxes into FHIR data representations. Essentially, this will make the data from faxed documents machine readable and more easily integrated into EHR systems.

**Tools used:**
* Twilio Programmable Fax API: an API that allows us to programmatically send and receive faxes.
* Amazon Web Services: we use AWS Comprehend, a machine learning PaaS, to parse and categorize faxed data. AWS S3 buckets are used to store intermediary and final data.

# Dev-Ops

This project uses a number of different Twilio and AWS services. For a detailed sequence diagram, look at `sequence-diagram.png`. See below for a detailed break-down of what's necessary to get everything working.

## Twilio

You will need a Twilio account and a phone number set up for Fax configured to send a Tiff file to your AWS endpoint. (Phone numbers are $1/month, but developer acccounts are free and come with $15 worth of credit.) The easiest way to configure your fax number is through Twilio's XML-based DSL, TwiML. Here's an example:
```
<?xml version="1.0" encoding="UTF-8"?>
<Response>
	<Receive action="https://YOUR_AWS_ENDPOINT_GOES_HERE.com" mediaType="image/tiff" storeMedia="true" />
</Response>
```

## AWS S3

You will need two S3 buckets, one to hold the incoming fax (both the original Tiff, and the OCRed text) and one for the AWS Comprehend results.

## AWS Comprehend

This example uses a custom classifier built with the training data in the `data` folder. There's a simple script (`bin/build-training-data`) that uses `pdf-to-text` to convert all the pdfs into the format that Comprehend is expecting. You can learn all about creating custom classifiers in the [AWS Comprehend Documentation](https://docs.aws.amazon.com/comprehend/latest/dg/how-document-classification.html).

## AWS Lambda

You will need two AWS Lambdas. Both can use the same code with different entry points (called "handlers" by AWS). The `bin/deploy` script will zip up all the necessary code and make it ready to be uploaded to AWS. (Make sure to run `yarn install` in the src directory first to ensure that all JS dependencies are included.) On the future roadmap is adding CloudFormation templates that will allow this script to do all the setup automatically.

### First Lambda (Fax Endpoint)

Trigger: API Gateway
Required Permissions: CloudWatch Logs, Comprehend, IAM (for assigning roles to Comprehend), S3
Runtime: NodeJS 8.10
Handler: handlers.faxUploadHandler
Environment Variables: CLASSIFIER\_ARN, CLASSIFIER_ROLE\_ARN, S3\_BUCKET\_FOR\_FAX, S3\_BUCKET\_FOR\_COMPREHEND_RESULTS

### Second Lambda (FHIR Upload)

Trigger: S3 trigger on ObjectCreated in the Comprehend results bucket
Required Permissions: CloudWatch Logs, S3
Runtime: NodeJS 8.10
Handler: handlers.comprehendCompletionHandler
Environment Variables: S3\_BUCKET\_FOR\_FAX, FHIR\_SERVER\_BASE\_URL
