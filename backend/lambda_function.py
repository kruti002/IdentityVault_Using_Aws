import json
import boto3
import uuid
import os
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
    orig_key = f"original/{kyc_id}_id.jpg"
    face_key = f"faces/{kyc_id}_face.jpg"
    selfie_key = f"selfies/{kyc_id}_selfie.jpg"

    urls = {
        "orig_url": s3.generate_presigned_url("put_object", Params={"Bucket": DOC_BUCKET, "Key": orig_key, "ContentType": "image/jpeg"}, ExpiresIn=300),
        "face_url": s3.generate_presigned_url("put_object", Params={"Bucket": FACES_BUCKET, "Key": face_key, "ContentType": "image/jpeg"}, ExpiresIn=300),
        "selfie_url": s3.generate_presigned_url("put_object", Params={"Bucket": SELFIE_BUCKET, "Key": selfie_key, "ContentType": "image/jpeg"}, ExpiresIn=300)
    }

    table = dynamodb.Table(TABLE_NAME)
    table.put_item(Item={
        "kyc_id": kyc_id,
        "original_doc_s3_key": orig_key,
        "doc_face_s3_key": face_key,
        "selfie_s3_key": selfie_key,
        "status": "PENDING_UPLOAD",
        "created_at": datetime.utcnow().isoformat()
    })
    return response(200, {"kyc_id": kyc_id, "urls": urls})

def handle_verify(event):
    try:
        body = json.loads(event.get("body", "{}"))
        kyc_id = body.get("kyc_id")
        table = dynamodb.Table(TABLE_NAME)
        item = table.get_item(Key={"kyc_id": kyc_id}).get("Item")
        
        if not item: return response(404, {"error": "KYC not found"})

        # 1. Compare Faces
        face_result = rekognition.compare_faces(
            SourceImage={"S3Object": {"Bucket": FACES_BUCKET, "Name": item["doc_face_s3_key"]}},
            TargetImage={"S3Object": {"Bucket": SELFIE_BUCKET, "Name": item["selfie_s3_key"]}},
            SimilarityThreshold=80
        )
        match = len(face_result["FaceMatches"]) > 0
        similarity = Decimal(str(face_result["FaceMatches"][0]["Similarity"])) if match else Decimal(0)

        # 2. Extract Text (OCR)
        text_result = rekognition.detect_text(
            Image={"S3Object": {"Bucket": DOC_BUCKET, "Name": item["original_doc_s3_key"]}}
        )
        raw_lines = [t["DetectedText"] for t in text_result["TextDetections"] if t["Type"] == "LINE"]
        
        # 3. Intelligent Extraction
        import re
        extracted = {"name": "Not Detected", "dob": "Not Detected", "id_number": "Not Detected"}
        
        # Enhanced patterns for Aadhaar / Generic IDs
        # Aadhaar: 12 digits (often 4 4 4)
        aadhaar_pattern = r"(?:\d{4}\s\d{4}\s\d{4}|\d{12})"
        id_patterns = [r"ID\s*[:#]?\s*([A-Z0-9-]+)", r"NO\s*[:#]?\s*([A-Z0-9-]+)", aadhaar_pattern]
        dob_patterns = [r"(\d{2}[/-]\d{2}[/-]\d{4})", r"DOB\s*[:]?\s*([\d\w\s-]+)"]
        
        # Keywords to ignore when looking for a Name
        ignore_keywords = ["GOVERNMENT", "INDIA", "MALE", "FEMALE", "TRANSGENDER", "BHARAT", "SARKAR", "AADHAAR", "AUTHORITY"]

        for line in raw_lines:
            line_val = line.upper().strip()
            
            # 1. Enhanced Name Detection
            if extracted["name"] == "Not Detected" and len(line) > 5:
                # Must have alpha chars, no numbers, and not be in the ignore list
                if not any(c.isdigit() for c in line) and not any(k in line_val for k in ignore_keywords):
                    extracted["name"] = line.strip()
            
            # 2. Enhanced ID Detection
            if extracted["id_number"] == "Not Detected":
                # Check direct Aadhaar pattern first
                aadhaar_match = re.search(aadhaar_pattern, line)
                if aadhaar_match:
                    extracted["id_number"] = aadhaar_match.group(0)
                else:
                    for p in id_patterns:
                        m = re.search(p, line_val)
                        if m: 
                            extracted["id_number"] = m.groups()[0] if m.groups() else m.group(0)

            # 3. DOB Detection
            if extracted["dob"] == "Not Detected":
                for p in dob_patterns:
                    m = re.search(p, line_val)
                    if m: extracted["dob"] = m.group(1).strip() if "(" not in m.group(1) else m.group(1)

        # 4. Update
        status = "VERIFIED" if match else "REJECTED"
        table.update_item(
            Key={"kyc_id": kyc_id},
            UpdateExpression="SET face_match=:m, similarity=:s, #st=:st, extracted_data=:d, updated_at=:t",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={":m": match, ":s": similarity, ":st": status, ":d": extracted, ":t": datetime.utcnow().isoformat()}
        )

        return response(200, {"kyc_id": kyc_id, "face_match": match, "similarity": float(similarity), "status": status, "extracted_data": extracted})
    except Exception as e:
        return response(500, {"error": str(e)})

def response(code, body):
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body)
    }
