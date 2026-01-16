# 🛡️ Identity Vault: Biometric KYC Setup Guide

Welcome to the **Identity Vault** setup guide! This document provides a beginner-friendly, step-by-step walkthrough to host your own biometric KYC (Know Your Customer) system on AWS.

---

## 🏗️ Phase 1: Storage & Database (S3 & DynamoDB)

### 1. Create S3 Buckets
You need **three** private buckets to store different types of images.
1. Log in to the [AWS S3 Console](https://s3.console.aws.amazon.com/).
2. Click **Create bucket** and name them (e.g., `my-kyc-docs`, `my-kyc-faces`, `my-kyc-selfies`).
3. **Important**: Enable **CORS** for each bucket so the frontend can upload files:
   - Go to the bucket -> **Permissions** tab -> Scroll to **CORS**.
   - Paste this configuration:
     ```json
     [
       {
         "AllowedHeaders": ["*"],
         "AllowedMethods": ["PUT", "POST", "GET"],
         "AllowedOrigins": ["*"],
         "ExposedHeaders": []
       }
     ]
     ```

### 2. Create DynamoDB Table
This stores the verification results and file paths.
1. Go to the [DynamoDB Console](https://console.aws.amazon.com/dynamodbv2/).
2. Click **Create table**.
3. **Table name**: `IdentityVaultRecords` (or your choice).
4. **Partition key**: `kyc_id` (Type: String).
5. Click **Create table**.

---

## ⚙️ Phase 2: The Logic (AWS Lambda)

### 1. Create the Lambda Function
1. Go to the [Lambda Console](https://console.aws.amazon.com/lambda/).
2. Click **Create function** -> **Author from scratch**.
3. **Function name**: `ProcessKYC`.
4. **Runtime**: `Python 3.11`.
5. Click **Create function**.

### 2. Deployment: Add `lambda_function.py`
1. Inside your new Lambda function, go to the **Code** tab.
2. Delete everything and paste the **Unified Logic Code** found in `backend/lambda_function.py` (or use the block below):

<details>
<summary><b>Click to expand: Full lambda_function.py Code</b></summary>

```python
import json
import boto3
import uuid
import os
import re
from datetime import datetime
from decimal import Decimal

# Initialize AWS Clients
s3 = boto3.client("s3")
rekognition = boto3.client("rekognition")
dynamodb = boto3.resource("dynamodb")

# Environment Variables
DOC_BUCKET = os.environ.get("DOC_BUCKET")
FACES_BUCKET = os.environ.get("FACES_BUCKET")
SELFIE_BUCKET = os.environ.get("SELFIE_BUCKET")
TABLE_NAME = os.environ.get("TABLE_NAME")

def lambda_handler(event, context):
    path = event.get("rawPath", event.get("path", ""))
    if "/get-urls" in path:
        return handle_get_urls()
    elif "/verify" in path:
        return handle_verify(event)
    return response(404, {"error": "Route not found"})

def handle_get_urls():
    kyc_id = f"kyc_{str(uuid.uuid4())[:8]}"
    orig_key, face_key, selfie_key = f"original/{kyc_id}_id.jpg", f"faces/{kyc_id}_face.jpg", f"selfies/{kyc_id}_selfie.jpg"
    urls = {
        "orig_url": s3.generate_presigned_url("put_object", Params={"Bucket": DOC_BUCKET, "Key": orig_key, "ContentType": "image/jpeg"}, ExpiresIn=300),
        "face_url": s3.generate_presigned_url("put_object", Params={"Bucket": FACES_BUCKET, "Key": face_key, "ContentType": "image/jpeg"}, ExpiresIn=300),
        "selfie_url": s3.generate_presigned_url("put_object", Params={"Bucket": SELFIE_BUCKET, "Key": selfie_key, "ContentType": "image/jpeg"}, ExpiresIn=300)
    }
    dynamodb.Table(TABLE_NAME).put_item(Item={"kyc_id": kyc_id, "original_doc_s3_key": orig_key, "doc_face_s3_key": face_key, "selfie_s3_key": selfie_key, "status": "PENDING_UPLOAD", "created_at": datetime.utcnow().isoformat()})
    return response(200, {"kyc_id": kyc_id, "urls": urls})

def handle_verify(event):
    try:
        body = json.loads(event.get("body", "{}"))
        kyc_id = body.get("kyc_id")
        table = dynamodb.Table(TABLE_NAME)
        item = table.get_item(Key={"kyc_id": kyc_id}).get("Item")
        if not item: return response(404, {"error": "KYC not found"})

        # 1. Compare Faces (Face extracted from ID vs Live Selfie)
        face_result = rekognition.compare_faces(
            SourceImage={"S3Object": {"Bucket": FACES_BUCKET, "Name": item["doc_face_s3_key"]}},
            TargetImage={"S3Object": {"Bucket": SELFIE_BUCKET, "Name": item["selfie_s3_key"]}},
            SimilarityThreshold=80
        )
        is_match = len(face_result["FaceMatches"]) > 0
        similarity = Decimal(str(face_result["FaceMatches"][0]["Similarity"])) if is_match else Decimal(0)

        # 2. Extract Text with Position Data
        ocr = rekognition.detect_text(Image={"S3Object": {"Bucket": DOC_BUCKET, "Name": item["original_doc_s3_key"]}})
        raw_detections = [t for t in ocr["TextDetections"] if t["Type"] == "LINE"]
        
        # Sort by physical position (Top to Bottom)
        sorted_detections = sorted(raw_detections, key=lambda x: x["Geometry"]["BoundingBox"]["Top"])
        raw_lines = [t["DetectedText"] for t in sorted_detections]

        extracted = {"name": "Not Detected", "dob": "Not Detected", "id_number": "Not Detected"}
        ignore_list = ["GOVERNMENT", "INDIA", "MALE", "FEMALE", "AADHAAR", "AUTHORITY", "SARKAR", "BHARAT", "MERA", "PEHCHAN", "AADHAKR"]
        aadhaar_pattern = r"(?:\d{4}\s\d{4}\s\d{4}|\d{12})"

        for line in raw_lines:
            line_up = line.upper().strip()
            # Name: Pure alpha-text, avoids common headers
            if extracted["name"] == "Not Detected" and len(line) > 5:
                if not any(c.isdigit() for c in line) and not any(k in line_up for k in ignore_list):
                    extracted["name"] = line.strip()
            # ID: Aadhaar 12-digit style
            id_m = re.search(aadhaar_pattern, line)
            if id_m and extracted["id_number"] == "Not Detected":
                extracted["id_number"] = id_m.group(0)
            # DOB: Standard Date formats
            dob_m = re.search(r"(\d{2}[/-]\d{2}[/-]\d{4})", line)
            if dob_m and extracted["dob"] == "Not Detected":
                extracted["dob"] = dob_m.group(1)

        # 3. Update Status
        table.update_item(Key={"kyc_id": kyc_id}, UpdateExpression="SET face_match=:m, similarity=:s, #st=:st, extracted_data=:d, updated_at=:t", ExpressionAttributeNames={"#st": "status"}, ExpressionAttributeValues={":m": is_match, ":s": similarity, ":st": "VERIFIED" if is_match else "REJECTED", ":d": extracted, ":t": datetime.utcnow().isoformat()})

        return response(200, {"kyc_id": kyc_id, "face_match": is_match, "similarity": float(similarity), "extracted_data": extracted})
    except Exception as e: return response(500, {"error": str(e)})

def response(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, "body": json.dumps(body)}
```
</details>

3. Click **Deploy**.

### 3. Configure Environment Variables
In the Lambda console, go to **Configuration** -> **Environment variables** -> **Edit**:
- `DOC_BUCKET`: `[Your Doc Bucket Name]`
- `FACES_BUCKET`: `[Your Face Bucket Name]`
- `SELFIE_BUCKET`: `[Your Selfie Bucket Name]`
- `TABLE_NAME`: `IdentityVaultRecords`

### 4. Permissions (IAM)
Go to **Configuration** -> **Permissions** -> Click the link under **Role name**.
1. Click **Add permissions** -> **Attach policies**.
2. Add these three: `AmazonS3FullAccess`, `AmazonRekognitionFullAccess`, `AmazonDynamoDBFullAccess`.
   *(Note: In production, use limited custom policies!)*

---

## 🌐 Phase 3: The API (API Gateway)

1. Go to the [API Gateway Console](https://console.aws.amazon.com/apigateway/).
2. Click **Create API** -> **HTTP API**.
3. **API Name**: `KYC_API`. Click **Next**.
4. Click **Configure routes**:
   - Add Route: `POST` | `/get-urls`
   - Add Route: `POST` | `/verify`
5. For **Integration**, select **Lambda** and choose your `ProcessKYC` function for both routes.
6. Click **Next** until **Create**.
7. **Copy the "Invoke URL"** (found under Dashboard or Stages).

---

## 🚀 Phase 4: Frontend Connection

1. Open `frontend/src/App.jsx`.
2. Locate the `CONFIG` constant near the top:
   ```javascript
   const CONFIG = {
     API_ENDPOINT: 'PASTE_YOUR_INVOKE_URL_HERE'
   };
   ```
3. Save the file.
4. Run locally: `npm install` then `npm run dev`.

**Congratulations! Your Biometric Identity Vault is live.** 🛡️✨
