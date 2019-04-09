# Fax-On-Fhir

This repository is a proof of concept, demonstrating a serverless workflow that may be used to parse data from faxes into FHIR data representations. Essentially, this will make the data from faxed documents machine readable and more easily integrated into EHR systems.

**Tools used:**
* Twilio Programmable Fax API: an API that allows us to programmatically send and receive faxes. 
* Amazon Web Services: we use AWS Comprehend, a machine learning SaaS, to parse and categorize faxed data. AWS S3 buckets are used to store intermediary and final data. 

