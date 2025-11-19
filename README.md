# PSP Backend

This repository contains the backend server for Premier Sport Psychology's Mindset Assessment platform. The server is responsible for receiving survey responses from Qualtrics, generating personalized PDF reports for athletes and staff, uploading these reports to AWS S3, and emailing the results to recipients and providers.

## Features

- Receives webhooks from Qualtrics for multiple survey types (e.g. Adult, Youth, Youth Golf, Staff).
- Fetches detailed survey responses from the Qualtrics API.
- Generates PDF reports using Playwright.
- Uploads generated reports to AWS S3 and creates presigned download links.
- Sends report download links via email using Mailgun.
- Notifies Slack and Microsoft Teams channels of new responses and delivery status.
- Deployed via [Fly.io](https://fly.io/).

## Project Structure

```
.
├── build/                # Static frontend assets (React app)
├── index.js              # Main Express server
├── Dockerfile            # Docker configuration for deployment
├── fly.toml              # Fly.io deployment configuration
├── .env                  # Environment variables (not committed)
├── .gitignore
└── package.json
```

> **Note:** If the PDF template is updated in the `psp-reports` repository, you must rebuild the frontend in that repo and replace the contents of the `build` folder in this repo with the new build output.

## Environment Variables

The server expects the following environment variables (see `.env`):

- `MAILGUN_API_KEY` - Mailgun API key for sending emails
- `SLACK_API_TOKEN` - Slack API token for posting notifications
- `QUALTRICS_API_TOKEN` - Qualtrics API token for fetching survey responses
- `AWS_ACCESS_KEY_ID` - AWS access key ID for S3 uploads (optional if using AWS credentials file)
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key for S3 uploads (optional if using AWS credentials file)
- `AWS_REGION` - AWS region (defaults to `us-east-1` if not set)

## Setup Instructions

### Prerequisites

- **Node.js** (version 16 or higher recommended, as per Dockerfile)
- **npm** (comes with Node.js)
- **Playwright browsers** (will be installed automatically)

### Step-by-Step Setup

1. **Install dependencies:**

    ```sh
    npm install
    ```

2. **Install Playwright browsers:**

    ```sh
    npx playwright install
    ```

    This installs the Chromium browser needed for PDF generation.

3. **Create a `.env` file:**

    Create a `.env` file in the root directory with the following variables:

    ```env
    MAILGUN_API_KEY=your_mailgun_api_key_here
    SLACK_API_TOKEN=your_slack_api_token_here
    QUALTRICS_API_TOKEN=your_qualtrics_api_token_here
    AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
    AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
    AWS_REGION=us-east-1
    ```

    **Note:** If you have AWS credentials configured via `~/.aws/credentials` or AWS IAM roles, you can omit the AWS environment variables.

4. **Ensure the `output` directory exists:**

    The `output` directory should already exist, but if it doesn't, create it:

    ```sh
    mkdir output
    ```

    This directory stores generated PDF reports before they're uploaded to S3.

5. **Start the server:**

    ```sh
    npm start
    ```

6. **Verify the server is running:**

    The server will listen on port 8080. You should see:
    ```
    Server listening on port 8080
    ```

    You can access the frontend at `http://localhost:8080`

### Testing the Setup

- The server serves the React frontend from the `build` directory
- Webhook endpoints are available at:
  - `POST /generate_report` - Adult Mindset Report
  - `POST /generate_report_youth_mindset` - Youth Mindset Report
  - `POST /generate_report_youth_golf_mindset` - Youth Golf Mindset Report
  - `POST /generate_report_staff_mindset` - Staff Mindset Report

### Troubleshooting

- **Playwright issues:** Make sure you've run `npx playwright install` after `npm install`
- **Missing dependencies:** Delete `node_modules` and `package-lock.json`, then run `npm install` again
- **Port already in use:** Change the port in `index.js` (line 35) and `fly.toml` if needed
- **AWS S3 errors:** Verify your AWS credentials have permissions to upload to the S3 buckets
- **Environment variables not loading:** Ensure your `.env` file is in the root directory and uses the correct variable names

## Deployment

Deployments are managed via [Fly.io](https://fly.io/). The [Dockerfile](Dockerfile) and [fly.toml](fly.toml) are configured for this platform.