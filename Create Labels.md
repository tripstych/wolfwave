Create Labels
Creating a shipping label using the ShipStation API generally includes two basic steps: submitting the create label request and then downloading the label from the URLs provided in the response.

Depending on your workflow, you can create the label using one of these options:

Create a shipping label: Use this option if you have not previously created a shipment. You’ll define all the shipment properties in the label’s shipment object.
Create label from a rate: Use this option if you have a rate_id either from previously calculating shipping rates or from an already existing shipment with rate options.
Create label from a shipment: Use this option if you have a shipment_id from a previously created shipment.
All of these options use the POST method with our /v2/labels endpoint.

When you use POST /v2/labels to create labels with your production API key, you are purchasing the label from the selected carrier. For ShipStation Carriers, the label cost will be deducted from your account balance. For your own carriers you've connected to ShipStation, you'll be invoiced according to that carrier's usual method.

Using Our Code Samples
When testing out these methods, you can copy/paste the code from any of our code samples below to help you get started. Change the programming language of the sample code using the drop-down list in the top right corner of the code block. You can then input your own values into the request for properties like carrier_code, ship_date, or any other properties relevant to or required by the request.

Requirements
The requirements will vary depending on which options you are using to create the label.

Create a shipping label: Requires a request body with all objects and properties necessary for the shipment. At minimum, the carrier ID, service code, ship date, ship to and ship from address, and the package details (weight and dimensions).
Create label from a rate: Requires the rate_id from an already existing shipment.
Create label from a shipment: Requires the shipment_id from an already existing shipment.
Create a Shipping Label
Use this option when you have not previously created a shipment. In this case, you’ll need to define the properties in the shipment object, like carrier_id and service_code, ship_from and ship_to address, and any other properties required by the specific shipment.

The sample request below will demonstrate the minimum properties required to create a label successfully. There are many properties not included in this request that may be required depending on the type of shipment and the carrier you use. Refer to the full API reference(/tk) to see all available properties.

Sample shipment details:

Field	Values
Carrier	UPS from ShipStation
Service	UPS Ground
Ship to address	Jane Doe
525 S Winchester Blvd
San Jose, CA 95128
+1 444-444-4444
Ship from address	John Doe
4301 Bull Creek Rd
Austin, TX 78731
+1 555-555-5555
Package weight	20 ounces
Package dimensions	12 x 24 x 6 inches
Sample Request & Response
POST /v2/labels



POST /v2/labels HTTP/1.1
Host: api.shipstation.com
API-Key: __YOUR_API_KEY_HERE__
Content-Type: application/json

{
 "shipment": {
  “carrier_id”: “ups_walleted”,
   "service_code": "ups_ground",
   "ship_to": {
     "name": "Jane Doe",
     "phone": "+1 444-444-4444",
     "address_line1": "525 S Winchester Blvd",
     "city_locality": "San Jose",
     "state_province": "CA",
     "postal_code": "95128",
     "country_code": "US",
     "address_residential_indicator": "yes"
   },
   "ship_from": {
     "name": "John Doe",
     "company_name": "Example Corp",
     "phone": "+1 555-555-5555",
     "address_line1": "4301 Bull Creek Rd",
     "city_locality": "Austin",
     "state_province": "TX",
     "postal_code": "78731",
     "country_code": "US",
     "address_residential_indicator": "no"
   },
   "packages": [
     {
       "weight": {
         "value": 20,
         "unit": "ounce"
       },
       "dimensions": {
         "height": 6,
         "width": 12,
         "length": 24,
         "unit": "inch"
       }
     }
   ]
 }
}
Phone Number Formatting
The phone property in the ship_to and ship_from objects is a string and is not validated based on format. However, some carriers may return an error if the format is not valid for the countries they deliver to. Best practice is to use the phone number format specific to the Ship To and Ship From country, including the calling-code prefix for the country.

Response

If your request was successful, you'll receive an HTTP 200 response(/tk). The response payload includes all the details you need about the label, including (but not limited to):

Status: completed
Label and shipment IDs
Label cost
Link to download the label in different formats (PNG, PDF, ZPL)
Service type
Package type
Label size
Tracking number


{
   "label_id": "se-396884371",
   "status": "completed",
   "shipment_id": "se-1080108982",
   "ship_date": "2024-01-03T08:00:00Z",
   "created_at": "2024-01-03T17:37:21.6482315Z",
   "shipment_cost": {
       "currency": "usd",
       "amount": 17.58
   },
   "insurance_cost": {
       "currency": "usd",
       "amount": 0.0
   },
   "requested_comparison_amount": null,
   "rate_details": [],
   "tracking_number": "1ZYF85760394283643",
   "is_return_label": false,
   "rma_number": null,
   "is_international": false,
   "batch_id": "",
   "carrier_id": "se-5904054",
   "service_code": "ups_ground",
   "package_code": "package",
   "voided": false,
   "voided_at": null,
   "label_format": "pdf",
   "display_scheme": "label",
   "label_layout": "4x6",
   "trackable": true,
   "label_image_id": null,
   "carrier_code": "ups",
   "tracking_status": "in_transit",
   "label_download": {
       "pdf": "https://api.shipstation.com/v2/downloads/10/N7a1AuQIwk2PjYM2H2KVrA/label-396884371.pdf",
       "png": "https://api.shipstation.com/v2/downloads/10/N7a1AuQIwk2PjYM2H2KVrA/label-396884371.png",
       "zpl": "https://api.shipstation.com/v2/downloads/10/N7a1AuQIwk2PjYM2H2KVrA/label-396884371.zpl",
       "href": "https://api.shipstation.com/v2/downloads/10/N7a1AuQIwk2PjYM2H2KVrA/label-396884371.pdf"
   },
   "form_download": null,
   "qr_code_download": null,
   "insurance_claim": null,
   "packages": [
       {
           "package_id": 415397454,
           "package_code": "package",
           "weight": {
               "value": 20.00,
               "unit": "ounce"
           },
           "dimensions": {
               "unit": "inch",
               "length": 24.00,
               "width": 12.00,
               "height": 6.00
           },
           "insured_value": {
               "currency": "usd",
               "amount": 0.00
           },
           "tracking_number": "1ZYF85760394283643",
           "label_download": {
               "pdf": "https://api.shipstation.com/v2/downloads/10/HKNTqQS9yEq7rWuATnCSqQ/labelpackage-415397454.pdf",
               "png": "https://api.shipstation.com/v2/downloads/10/HKNTqQS9yEq7rWuATnCSqQ/labelpackage-415397454.png",
               "zpl": "https://api.shipstation.com/v2/downloads/10/HKNTqQS9yEq7rWuATnCSqQ/labelpackage-415397454.zpl"
           },
           "qr_code_download": null,
           "label_messages": {
               "reference1": null,
               "reference2": null,
               "reference3": null
           },
           "external_package_id": null,
           "content_description": null,
           "sequence": 1,
           "alternative_identifiers": []
       }
   ],
   "charge_event": "carrier_default",
   "alternative_identifiers": []
}
Download the Label
In your response, the label_download object includes the URLs you can use to download the label in the various available formats.



{
 "label_download": {
   "pdf": "https://api.shipstation.com/v2/downloads/10/XNGDhq7uZ0CAEt5LOnCxIg/label-7764944.pdf",
   "png": "https://api.shipstation.com/v2/downloads/10/XNGDhq7uZ0CAEt5LOnCxIg/label-7764944.png",
   "zpl": "https://api.shipstation.com/v2/downloads/10/XNGDhq7uZ0CAEt5LOnCxIg/label-7764944.zpl",
   "href": "https://api.shipstation.com/v2/downloads/10/XNGDhq7uZ0CAEt5LOnCxIg/label-7764944.pdf"
 }
}
These URLs are just like any other URLs in that you can paste them into a browser to download the file. You can also download the label using curl.

Copy the curl request below and replace the __YOUR_LABEL_URL_HERE__ placeholder with the URL of the label format you wish to download.



curl -iOX GET __YOUR_LABEL_URL_HERE__
Request and Download in One Call
In the example above, two requests were necessary... one to create the label and another to download the .pdf file. You can accomplish both steps in a single request by setting label_download_type: "inline". See Download a Label for more details.

Create Label from a Rate
If you have a rate ID, either from previously calculating shipping rates or from an already existing shipment with rate options, you can use the rate_id to create a label.

When you use a rate_id to create a label you've already done the hard part! We persist all of the rate response details so you just need to pass us the rate_id.

Sample Request & Response
This sample also demonstrates adding label_format and label_layout properties to the request body, though these are not required.

POST v2/labels/rates/:rate_id



POST /v2/labels/rates/se-2128728 HTTP/1.1
Host: api.shipstation.com
API-Key: __YOUR_API_KEY_HERE__
Content-Type: application/json

{
 "label_format":"pdf",
 "label_layout": "4x6"
}
Response



{
 "label_id": "se-test-2128728",
 "status": "completed",
 "shipment_id": "se-2128728",
 "ship_date": "2024-07-25T05:00:00.000Z",
 "created_at": "2024-07-25T18:43:15.038Z",
 "shipment_cost": {
   "currency": "usd",
   "amount": 0.0
 },
 "insurance_cost": {
   "currency": "usd",
   "amount": 0.0
 },
 "tracking_number": "9999999999999",
 "is_return_label": false,
 "is_international": false,
 "batch_id": "",
 "carrier_id": "se-0",
 "service_code": "usps_priority_mail",
 "package_code": "package",
 "voided": false,
 "voided_at": null,
 "label_format": "pdf",
 "label_layout": "4x6",
 "trackable": false,
 "carrier_code": "stamps_com",
 "tracking_status": "unknown",
 "label_download": {
   "pdf": "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.pdf",
   "png": "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.png",
   "zpl": "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.zpl",
   "href": "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.pdf"
 },
 "form_download": null,
 "insurance_claim": null
}
And that's it! The label is available for download using any of the label_download URLs provided in the response.

Create Label from a Shipment
If you have an existing shipment, you can create a label using just the shipment_id.

Using a shipment_id to create a label is the quickest way to create a label after you've successfully planned your shipment. You can also specify the label format, size, and download type to modify the way your label is formatted. You'll simply provide these properties in the body of your request.

Sample Request & Response
POST v2/labels/shipment/:shipment_id



POST /v2/labels/shipment/se-2128732 HTTP/1.1
Host: api.shipstation.com
API-Key: __YOUR_API_KEY_HERE__
Content-Type: application/json

{
 "label_format":"pdf",
 "label_layout": "4x6",
 "label_download_type": "url"
}
Response



{
 "label_id": "se-test-2128732",
 "status": "completed",
 "shipment_id": "se-2128732",
 "ship_date": "2024-07-25T05:00:00.000Z",
 "created_at": "2024-07-25T18:43:15.038Z",
 "shipment_cost": {
   "currency": "usd",
   "amount": 0.0
 },
 "insurance_cost": {
   "currency": "usd",
   "amount": 0.0
 },
 "tracking_number": "9999999999999",
 "is_return_label": false,
 "is_international": false,
 "batch_id": "",
 "carrier_id": "se-0",
 "service_code": "usps_priority_mail",
 "package_code": "package",
 "voided": false,
 "voided_at": null,
 "label_format": "pdf",
 "label_layout": "4x6",
 "trackable": false,
 "carrier_code": "stamps_com",
 "tracking_status": "unknown",
 "label_download": {
   "pdf": "https://api.shipstation.com/v2/downloads/1/s_Tqsu9euEKub6Acc_9UIg/testlabel-2128732.pdf",
   "png": "https://api.shipstation.com/v2/downloads/1/s_Tqsu9euEKub6Acc_9UIg/testlabel-2128732.png",
   "zpl": "https://api.shipstation.com/v2/downloads/1/s_Tqsu9euEKub6Acc_9UIg/testlabel-2128732.zpl",
   "href": "https://api.shipstation.com/v2/downloads/1/s_Tqsu9euEKub6Acc_9UIg/testlabel-2128732.pdf"
 },
 "form_download": null,
 "insurance_claim": null
}
And that's it! The label is available for download using any of the label_download URLs provided in the response.

Multi-Package Labels
You can also create multiple labels for a set of packages that are part of a single shipment. When you use multi-package labels, you can group packages together, get discounted rates, and retrieve a one-to-many “parent” tracking number for all packages in the shipment.

When submitting a request for multi-package labels, you'll add each package's details into the packages array in the shipment object.

Requirements
You must have the weight, dimensions, and insurance properties (if applicable) for each package in the shipment.
You must use a carrier and service that supports multi-package labels.
Not all carriers and services support multi-package shipping. To learn which services support multi-package check the is_multi_package_supported property when listing carriers or listing carrier services.
Popular carriers that have multi-package services include FedEx, UPS, DHL Express, DHL Express Canada, DHL Express UK, FirstMile, and Purolator Canada.
Package Types for Multi-Package Labels
All multi-package labels created in ShipStation will use the package package type. This is because carrier-specific packaging is not widely supported by carriers for multi-package labels.

Rate requests for multi-package labels that include carrier-specific package types may return rates. However, any labels created from the quoted rates will update the package type to package.

Sample Request & Response
This sample includes weight, insurance, and dimension properties for two packages. When adding insurance for multi-package labels, you can specify unique insurance values for each package.

POST /v2/labels



POST /v2/labels HTTP/1.1
Host: api.shipstation.com
API-Key: __YOUR_API_KEY_HERE__
Content-Type: application/json

{
 "shipment": {
   "service_code": "fedex_express_saver",
   "ship_to": {
     "name": "Amanda Miller",
     "phone": "555-555-5555",
     "address_line1": "525 S Winchester Blvd",
     "city_locality": "San Jose",
     "state_province": "CA",
     "postal_code": "95128",
     "country_code": "US",
     "address_residential_indicator": "yes"
   },
   "ship_from": {
     "company_name": "Example Corp.",
     "name": "John Doe",
     "phone": "111-111-1111",
     "address_line1": "4009 Marathon Blvd",
     "address_line2": "Suite 300",
     "city_locality": "Austin",
     "state_province": "TX",
     "postal_code": "78756",
     "country_code": "US",
     "address_residential_indicator": "no"
   },
   "insurance_provider": "carrier",
   "packages": [
     {
       "weight": {
         "value": 10.0,
         "unit": "ounce"
       },
       "insured_value": {
         "amount": 110.00,
         "currency": "USD"
       },
       "dimensions": {
         "length": 10,
         "height": 10,
         "width": 10,
         "unit": "inch"
       }
     },
     {
       "weight": {
         "value": 20.0,
         "unit": "ounce"
       },
       "insured_value": {
         "amount": 200.00,
         "currency": "USD"
       },
       "dimensions": {
         "length": 15,
         "height": 15,
         "width": 15,
         "unit": "inch"
       }
     }
   ]
 }
}
Response

In the response, we consolidate all of the labels into a multi-page PDF or ZPL file in the label_download object. Currently, we don't support the PNG format for multi-package label downloads. However, each package will also have their own label_download object.



{
   "label_id": "se-120646641",
   "status": "completed",
   "shipment_id": "se-236897068",
   "ship_date": "2024-01-04T00:00:00Z",
   "created_at": "2024-01-04T19:13:22.3055032Z",
   "shipment_cost": {
       "currency": "usd",
       "amount": 205.69
   },
   "insurance_cost": {
       "currency": "usd",
       "amount": 6.3
   },
   "tracking_number": "794699375744",
   "is_return_label": false,
   "rma_number": null,
   "is_international": false,
   "batch_id": "",
   "carrier_id": "se-121495",
   "service_code": "fedex_express_saver",
   "package_code": "package",
   "voided": false,
   "voided_at": null,
   "label_format": "pdf",
   "display_scheme": "label",
   "label_layout": "4x6",
   "trackable": true,
   "label_image_id": null,
   "carrier_code": "fedex",
   "tracking_status": "in_transit",
   "label_download": {
       "pdf": "https://api.shipstation.com/v2/downloads/10/WJe_Vy3P20K8TUEt-a_5YQ/label-120646641.pdf",
       "zpl": "https://api.shipstation.com/v2/downloads/10/WJe_Vy3P20K8TUEt-a_5YQ/label-120646641.zpl",
       "href": "https://api.shipstation.com/v2/downloads/10/WJe_Vy3P20K8TUEt-a_5YQ/label-120646641.pdf"
   },
   "form_download": null,
   "insurance_claim": null,
   "packages": [
       {
           "package_id": 127246591,
           "package_code": "package",
           "weight": {
               "value": 10.00,
               "unit": "ounce"
           },
           "dimensions": {
               "unit": "inch",
               "length": 10.00,
               "width": 10.00,
               "height": 10.00
           },
           "insured_value": {
               "currency": "usd",
               "amount": 110.00
           },
           "tracking_number": "794699375744",
           "label_download": {
               "pdf": "https://api.shipstation.com/v2/downloads/10/e1CdkA2cKEmtkFTHl5Jpjw/labelpackage-127246591.pdf",
               "png": "https://api.shipstation.com/v2/downloads/10/e1CdkA2cKEmtkFTHl5Jpjw/labelpackage-127246591.png",
               "zpl": "https://api.shipstation.com/v2/downloads/10/e1CdkA2cKEmtkFTHl5Jpjw/labelpackage-127246591.zpl"
           },
           "label_messages": {
               "reference1": null,
               "reference2": null,
               "reference3": null
           },
           "external_package_id": null,
           "sequence": 1
       },
       {
           "package_id": 127246592,
           "package_code": "package",
           "weight": {
               "value": 20.00,
               "unit": "ounce"
           },
           "dimensions": {
               "unit": "inch",
               "length": 15.00,
               "width": 15.00,
               "height": 15.00
           },
           "insured_value": {
               "currency": "usd",
               "amount": 200.00
           },
           "tracking_number": "794699375788",
           "label_download": {
               "pdf": "https://api.shipstation.com/v2/downloads/10/eJHEkrjJx0C3TA1lE_U3ww/labelpackage-127246592.pdf",
               "png": "https://api.shipstation.com/v2/downloads/10/eJHEkrjJx0C3TA1lE_U3ww/labelpackage-127246592.png",
               "zpl": "https://api.shipstation.com/v2/downloads/10/eJHEkrjJx0C3TA1lE_U3ww/labelpackage-127246592.zpl"
           },
           "label_messages": {
               "reference1": null,
               "reference2": null,
               "reference3": null
           },
           "external_package_id": null,
           "sequence": 2
       }
   ],
   "charge_event": "carrier_default"
}
Label Examples
This is the parent tracking label, the first label in the series.

multi-package parent label

This is the second label in the series. It has its own "child" tracking number but also includes the parent tracking number it's connected to.

multi-package child label

