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
- (Other AWS credentials may be required for S3 access)

## Running Locally

1. Install dependencies:

    ```sh
    npm install
    ```

2. Set up your `.env` file with the required secrets.

3. Start the server:

    ```sh
    npm start
    ```

4. The server will listen on port 8080 (as configured in [fly.toml](fly.toml)).

## Deployment

Deployments are managed via [Fly.io](https://fly.io/). The [Dockerfile](Dockerfile) and [fly.toml](fly.toml) are configured for this platform.