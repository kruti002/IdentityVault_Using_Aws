# Identity Vault: Biometric KYC Portal

An enterprise-grade, AI-powered identity verification system built for security and speed. **Identity Vault** automates the traditionally slow KYC (Know Your Customer) process using cutting-edge biometric scanning and document intelligence.

---

##  Video Demonstration

[![Identity Vault Demo](https://img.youtube.com/vi/pw8ZIH5rhQg/0.jpg)](https://youtu.be/pw8ZIH5rhQg)

> *Watch the Identity Vault in action! This video demonstrates the full end-to-end flow: from ID upload and face extraction to live selfie verification and real-time database updates.*

---

##  Key Features

- **Biometric Face Matching**: Uses **AWS Rekognition** to compare faces extracted from official ID documents with live selfies with 99%+ accuracy.
- **Intelligent Document OCR**: Automatically extracts **Full Name**, **Date of Birth**, and **Aadhaar/ID Numbers** directly from images.
- **Two-Column Premium UI**: A futuristic, dark-themed dashboard featuring 3D isometric illustrations and fluid Framer Motion animations.
- **Secure Cloud Storage**: Images are uploaded directly to private **AWS S3** buckets via temporary pre-signed URLs for maximum security.
- **Real-time Processing**: Verifications are completed in seconds using a scalable **AWS Lambda** serverless backend.

---

##  Tech Stack

- **Frontend**: React, Framer Motion (Animations), Lucide (Icons), Axios.
- **Backend**: AWS Lambda (Python 3.11).
- **AI/ML**: AWS Rekognition (Face Comparison & Text Detection).
- **Storage**: AWS S3.
- **Database**: AWS DynamoDB.
- **API**: AWS API Gateway.

---

## Getting Started

To set up this project yourself, please follow our detailed step-by-step guides:

1. **[AWS Backend Setup](./SETUP.md)**: Configure your S3 buckets, DynamoDB, and Lambda functions.


---
##  Security First

The Identity Vault is designed with privacy-first principles:
- **No Permanent Exposure**: Presigned URLs expire in 5 minutes.
- **Isolated Storage**: Document scans, cropped faces, and selfies are stored in separate, private S3 buckets.
- **Serverless Security**: Logic is executed in temporary, secure Lambda environments.

---


