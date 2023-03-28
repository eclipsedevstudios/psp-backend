const axios = require('axios');
const bodyParser = require('body-parser');
const express = require("express");
const fs = require('fs');
const request = require("request");
const path = require('path');
const { chromium } = require('playwright');
const mailgun = require("mailgun-js")({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: "mg.premiersportpsychology.com",
});
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { WebClient } = require('@slack/web-api');
const querystring = require('querystring');

const app = express();

// Qualtrics sends POST of x-www-form-urlencoded data
app.use(express.urlencoded({ extended: true }));

// Must keep this synced with the port defined in fly.toml
const port = 8080;

app.use((req, res, next) => {
  // Note: Set other allowed origins here
  const allowedOrigins = ['http://localhost:3000', 'http://psp-backend.fly.dev/'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  next();
});

// This serves the psp-reports app on http://locahost:${port}
// Remember to move the /build folder into psp-backend/
app.use(express.static(path.join(__dirname, 'build')));
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'))
});

app.get('/test', (req, res) => {
  res.send('Hello world');
});

const postToSlack = async (message) => {
  const web = new WebClient(process.env.SLACK_API_TOKEN);

  try {
    const result = await web.chat.postMessage({
      channel: 'C04J0DQ4GKS',
      text: message,
    });
    console.log('Slack message successfully posted!');
  } catch (error) {
    console.error(error);
  }
};

const getQualtricsResponse = async (surveyId, responseId) => {
  console.log(`Getting response from Qualtrics for ${responseId}...`);
  const QUALTRICS_DATA_CENTER = 'iad1';
  const url = `https://${QUALTRICS_DATA_CENTER}.qualtrics.com/API/v3/surveys/${surveyId}/responses/${responseId}`;
  
  const qualtricsData = await axios.get(url, {
    headers: {
      'X-API-TOKEN': process.env.QUALTRICS_API_TOKEN,
    }
  })
  .then((res) => {
    // Handles the Dev Test Survey
    // if (surveyId === 'SV_bxCYHF4NbsmqS0e') {
    //   const testResponse = res.data.result.values['QID1_TEXT'];

    //   const slackMessage = `*New Qualtrics response fetched:*\n\nSurvey ID: ${surveyId}\nResponse ID: ${responseId}\nTest response: ${testResponse}`;
    //   postToSlack(slackMessage);

    //   return {};
    // }

    // Handles the Mindset Assessment
    if (surveyId === 'SV_5zNrXkf1Z4ozvRs') {
      const data = res.data.result.values;
      const athleteName = data.QID9_TEXT;
      const email = data.QID12_TEXT;
      const recordedDate = data.recordedDate;
      const level = data.Level;

      const growthMindsetPercentile = data.GP;
      const growthMindsetPercentileCollege = data.MSColComparison;
      const growthMindsetPercentilePro = data.MSProComparison;

      const mentalSkillsPercentile = data.PP;
      const mentalSkillsPercentileCollege = data.MSColComparison;
      const mentalSkillsPercentilePro = data.MSProComparison;

      const teamSupportPercentile = data.TP;
      const teamSupportPercentileCollege = data.TSColComparison;
      const teamSupportPercentilePro = data.TSProComparison;

      const healthHabitsPercentile = data.PhP;
      const healthHabitsPercentileCollege = data.HHColComparison;
      const healthHabitsPercentilePro = data.HHProComparison;

      const selfReflectionPercentile = data.MP;
      const selfReflectionPercentileCollege = data.SRColComparison;
      const selfReflectionPercentilePro = data.SRProComparison;

      // const slackMessage = `*New Qualtrics response fetched:*\n\nSurvey ID: ${surveyId}\nResponse ID: ${responseId}\nLevel: ${level}\n\nGrowth Mindset Percentile: ${growthMindsetPercentile}\nMental Skills Percentile: ${mentalSkillsPercentile}\nTeam Support Percentile: ${teamSupportPercentile}\nHealth Habits Percentile: ${healthHabitsPercentile}\nSelf Reflection Percentile: ${selfReflectionPercentile}\n`;
      // postToSlack(slackMessage);

      const result = {
        athleteName,
        email,
        recordedDate,
        level,
        growthMindsetPercentile,
        growthMindsetPercentileCollege,
        growthMindsetPercentilePro,
        mentalSkillsPercentile,
        mentalSkillsPercentileCollege,
        mentalSkillsPercentilePro,
        teamSupportPercentile,
        teamSupportPercentileCollege,
        teamSupportPercentilePro,
        healthHabitsPercentile,
        healthHabitsPercentileCollege,
        healthHabitsPercentilePro,
        selfReflectionPercentile,
        selfReflectionPercentileCollege,
        selfReflectionPercentilePro,
      }

      console.log('Successfully fetched Qualtrics data - returning:');
      console.log(result)

      return result;
    }
  })
  .catch((error) => {
    console.error(`An error occurred while retreiving responseId: ${responseId}`);
    console.error(error)
    throw Error(error);
  })

  return qualtricsData;
};

const generatePdfReport = async (reportUrl, responseId) => {
  console.log(`Beginning PDF generation of the url: ${reportUrl}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(reportUrl);

  // Wait for page to fully load
  await new Promise(function(resolve) { 
    setTimeout(resolve, 4000);
  });

  await page.pdf({ path: `output/psp-mindset-assessment-report-${responseId}.pdf` })
  await browser.close()

  console.log("Successfully generated PDF report");
}

const uploadToS3 = async (responseId) => {
  const REGION = "us-east-1";
  const s3Client = new S3Client({
    region: REGION,
  });

  const BUCKET_NAME = 'psp-mindset-assessment-reports';
  const OBJECT_NAME = `psp-mindset-assessment-report-${responseId}.pdf`;
  const fileContent = fs.readFileSync(`output/psp-mindset-assessment-report-${responseId}.pdf`);

  const putObjectParams = {
    Bucket: BUCKET_NAME,
    Key: OBJECT_NAME,
    Body: fileContent
  };

  const putObjectCommand = new PutObjectCommand(putObjectParams);
  console.log(`Beginning upload of ${OBJECT_NAME} to S3...`);
  await s3Client.send(putObjectCommand);

  const getObjectParams = {
    Bucket: BUCKET_NAME,
    Key: OBJECT_NAME,
  };

  const getObjectCommand = new GetObjectCommand(getObjectParams);
  // max expiration is 1 week
  const url = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 604800 });
  return url;
};

const emailReport = async (athleteName, reportUrl) => {
  const data = {
    from: "Premier Sport Psychology <mindset@premiersportpsychology.com>",
    to: "roobeelee@gmail.com",
    subject: "Your Mindset Assessment Results from Premier Sport Psychology",
    html: `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Your Mindset Assessment Results from Premier Sport Psychology</title>
    <style>
      @media only screen and (max-width: 620px) {
        table.body h1 {
          font-size: 28px !important;
          margin-bottom: 10px !important;
        }

        table.body p,
        table.body ul,
        table.body ol,
        table.body td,
        table.body span,
        table.body a {
          font-size: 16px !important;
        }

        table.body .wrapper,
        table.body .article {
          padding: 10px !important;
        }

        table.body .content {
          padding: 0 !important;
        }

        table.body .container {
          padding: 0 !important;
          width: 100% !important;
        }

        table.body .main {
          border-left-width: 0 !important;
          border-radius: 0 !important;
          border-right-width: 0 !important;
        }

        table.body .btn table {
          width: 100% !important;
        }

        table.body .btn a {
          width: 100% !important;
        }

        table.body .img-responsive {
          height: auto !important;
          max-width: 100% !important;
          width: auto !important;
        }
      }

      @media all {
        .ExternalClass {
          width: 100%;
        }

        .ExternalClass,
        .ExternalClass p,
        .ExternalClass span,
        .ExternalClass font,
        .ExternalClass td,
        .ExternalClass div {
            line-height: 100%;
          }

        .apple-link a {
          color: inherit !important;
          font-family: inherit !important;
          font-size: inherit !important;
          font-weight: inherit !important;
          line-height: inherit !important;
          text-decoration: none !important;
        }

        #MessageViewBody a {
          color: inherit;
          text-decoration: none;
          font-size: inherit;
          font-family: inherit;
          font-weight: inherit;
          line-height: inherit;
        }

        .btn-primary table td:hover {
          background-color: #34495e !important;
        }

        .btn-primary a:hover {
          background-color: #34495e !important;
          border-color: #34495e !important;
        }
      }
    </style>
  </head>
  <body style="background-color: #f6f6f6; font-family: sans-serif; -webkit-font-smoothing: antialiased; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;">
    <span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">This is preheader text. Some clients will show this text as a preview.</span>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="body" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #f6f6f6; width: 100%;" width="100%" bgcolor="#f6f6f6">
      <tr>
        <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">&nbsp;</td>
        <td class="container" style="font-family: sans-serif; font-size: 14px; vertical-align: top; display: block; max-width: 580px; padding: 10px; width: 580px; margin: 0 auto;" width="580" valign="top">
          <div class="content" style="box-sizing: border-box; display: block; margin: 0 auto; max-width: 580px; padding: 10px;">

            <!-- START CENTERED WHITE CONTAINER -->
            <table role="presentation" class="main" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background: #ffffff; border-radius: 3px; width: 100%;" width="100%">

              <!-- START MAIN CONTENT AREA -->
              <tr>
                <td class="wrapper" style="font-family: sans-serif; font-size: 14px; vertical-align: top; box-sizing: border-box; padding: 20px;" valign="top">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                    <tr>
                      <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Hi ${athleteName},</p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Thank you for completing Premier Sport Psychology’s Mindset Assessment. This assessment is designed to assess your behaviors, thoughts, and feelings related to your wellness and performance as an athlete. It is also an important step on the road to improved mental performance.
                        </p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Please download your report below to view your scores and how they compare to other athletes at your level. We encourage you to share these results with your coaches, sport psychology provider, or others in your life who are working to support your success.</p>
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="btn btn-primary" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; box-sizing: border-box; width: 100%;" width="100%">
                          <tbody>
                            <tr>
                              <td align="left" style="font-family: sans-serif; font-size: 14px; vertical-align: top; padding-bottom: 15px;" valign="top">
                                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: auto;">
                                  <tbody>
                                    <tr>
                                      <td style="font-family: sans-serif; font-size: 14px; vertical-align: top; border-radius: 5px; text-align: center; background-color: #3498db;" valign="top" align="center" bgcolor="#3498db"> <a href="${reportUrl}" target="_blank" style="border: solid 1px #3498db; border-radius: 5px; box-sizing: border-box; cursor: pointer; display: inline-block; font-size: 14px; font-weight: bold; margin: 0; padding: 12px 25px; text-decoration: none; text-transform: capitalize; background-color: #3498db; border-color: #3498db; color: #ffffff;">Download your report</a> </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                          Are you interested in learning more about the athlete mindset and sport psychology? We have a dedicated team of professionals ready to help! <a href='https://premiersportpsychology.com/'>Our website</a> includes resources and information about sport psychology, as well as a link to <a href='https://premiersportpsychology.com/request-appointment/'>request an appointment</a>. Mention that you took the Mindset Assessment for $20 off your first session!
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            <!-- END MAIN CONTENT AREA -->
            </table>
            <!-- END CENTERED WHITE CONTAINER -->

            <!-- START FOOTER -->
            <div class="footer" style="clear: both; margin-top: 10px; text-align: center; width: 100%;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                <tr>
                  <td class="content-block" style="font-family: sans-serif; vertical-align: top; padding-bottom: 10px; padding-top: 10px; color: #999999; font-size: 12px; text-align: center;" valign="top" align="center">
                    <span class="apple-link" style="color: #999999; font-size: 12px; text-align: center;">Premier Sport Psychology, 7401 Metro Blvd Suite 51010, Edina, MN 55439</span>
                  </td>
                </tr>
              </table>
            </div>
            <!-- END FOOTER -->

          </div>
        </td>
        <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">&nbsp;</td>
      </tr>
    </table>
  </body>
</html>
    `,
    text: `Hi {athleteName},\n\nThank you for completing Premier Sport Psychology’s Mindset Assessment. This assessment is designed to assess your behaviors, thoughts, and feelings related to your wellness and performance as an athlete. It is also an important step on the road to improved mental performance.\n\nPlease download your report below to view your scores and how they compare to other athletes at your level. We encourage you to share these results with your coaches, sport psychology provider, or others in your life who are working to support your success.\n\nDownload your report: ${reportUrl}\n\nAre you interested in learning more about the athlete mindset and sport psychology? We have a dedicated team of professionals ready to help! Our website (https://premiersportpsychology.com/) includes resources and information about sport psychology, as well as a link to request an appointment. Mention that you took the Mindset Assessment for $20 off your first session!`,
  };

  mailgun.messages().send(data, function(error, body) {
    if (error) {
      console.error(error);
      throw Error(error);
    } else {
      console.log(body);
    }
  });
}

// Consumes Qualtrics webhook
app.post('/generate_report', (req, res) => {
  console.log('Webhook listener received request body:')
  console.log(req.body);

  // Send a 200 status code to acknowledge receiving the webhook
  res.status(200).end();

  const surveyId = req.body['SurveyID'];
  const responseId = req.body['ResponseID'];
  const responseTimestamp = req.body['CompletedDate'];

  const slackMessage = `*New Qualtrics response received:*\n\nSurvey ID: ${surveyId}\nResponse ID: ${responseId}\nTimestamp: ${responseTimestamp}`;
  postToSlack(slackMessage);

  const MINDSET_SURVEY_ID = 'SV_5zNrXkf1Z4ozvRs';
  if (surveyId === MINDSET_SURVEY_ID) {
    // TODO: Change recipient email (i.e. the final launch step). Only do this once Qualtrics email has been disabled

    getQualtricsResponse(surveyId, responseId)
    .then((qualtricsData) => {
      const {
        athleteName,
        email,
        recordedDate,
        level,
        growthMindsetPercentile,
        growthMindsetPercentileCollege,
        growthMindsetPercentilePro,
        mentalSkillsPercentile,
        mentalSkillsPercentileCollege,
        mentalSkillsPercentilePro,
        teamSupportPercentile,
        teamSupportPercentileCollege,
        teamSupportPercentilePro,
        healthHabitsPercentile,
        healthHabitsPercentileCollege,
        healthHabitsPercentilePro,
        selfReflectionPercentile,
        selfReflectionPercentileCollege,
        selfReflectionPercentilePro,
      } = qualtricsData;
  
      const urlParams = {
        reportOnly: 'true',
        athleteName,
        recordedDate,
        level,
        growthMindsetPercentile: growthMindsetPercentile.replace('%', ''),
        growthMindsetPercentileCollege: growthMindsetPercentileCollege.replace('%', ''),
        growthMindsetPercentilePro: growthMindsetPercentilePro.replace('%', ''),
        mentalSkillsPercentile: mentalSkillsPercentile.replace('%', ''),
        mentalSkillsPercentileCollege: mentalSkillsPercentileCollege.replace('%', ''),
        mentalSkillsPercentilePro: mentalSkillsPercentilePro.replace('%', ''),
        teamSupportPercentile: teamSupportPercentile.replace('%', ''),
        teamSupportPercentileCollege: teamSupportPercentileCollege.replace('%', ''),
        teamSupportPercentilePro: teamSupportPercentilePro.replace('%', ''),
        healthHabitsPercentile: healthHabitsPercentile.replace('%', ''),
        healthHabitsPercentileCollege: healthHabitsPercentileCollege.replace('%', ''),
        healthHabitsPercentilePro: healthHabitsPercentilePro.replace('%', ''),
        selfReflectionPercentile: selfReflectionPercentile.replace('%', ''),
        selfReflectionPercentileCollege: selfReflectionPercentileCollege.replace('%', ''),
        selfReflectionPercentilePro: selfReflectionPercentilePro.replace('%', ''),
      }
      const url = 'https://psp-backend.fly.dev/?' + querystring.stringify(urlParams);
  
      generatePdfReport(url, responseId)
      .then(() => {
        uploadToS3(responseId)
        .then(reportUrl => {
          console.log(`Successful upload to S3! Presigned URL: ${reportUrl}`);
          emailReport(athleteName, reportUrl)
          
          .then(() => {
            console.log('All steps completed!');
            const slackMessage = `*Email with report delivered:*\n\nResponse ID: ${responseId}\nEmail: ${email}\nReport URL: ${reportUrl}`;
            postToSlack(slackMessage);
          })
          .catch(error => {
            console.error(error);
            const slackMessage = `*Failed to send email with report:*\n\nResponse ID: ${responseId}\nEmail: ${email}\nReport URL: ${reportUrl}`;
            postToSlack(slackMessage);
          })
        })
        .catch(error => {
          console.error(error);
          const slackMessage = `*Failed to upload to S3:*\n\nResponse ID: ${responseId}\nEmail: ${email}`;
          postToSlack(slackMessage);
        });
      })
      .catch(error => {
        console.error(error);
        const slackMessage = `*Failed to generate report:*\n\nResponse ID: ${responseId}\nEmail: ${email}`;
        postToSlack(slackMessage);
      })
    })
    .catch(error => {
      console.error(error);
      const slackMessage = `*Failed to fetch Qualtrics response:*\n\nResponse ID: ${responseId}\nEmail: ${email}`;
      postToSlack(slackMessage);
    })
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});