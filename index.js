require('dotenv').config();

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
const QUALTRICS_SPANISH_LANGUAGE_CODE = "ES-ES";
const QUALTRICS_ADULT_MINDSET_SURVEY_ID = 'SV_5zNrXkf1Z4ozvRs';
const QUALTRICS_YOUTH_MINDSET_SURVEY_ID = 'SV_afqUZdlh3nKp3wi';
const QUALTRICS_YOUTH_MINDSET_GOLF_SURVEY_ID = 'SV_0q7oaLHkRcDjPp4';
const QUALTRICS_STAFF_MINDSET_SURVEY_ID = 'SV_429WRg8lEN9jseW';
const QUALTRICS_HOCKEY_CODE = "Hockey";

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
app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'))
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
    console.error('Error posting to Slack:', error);
  }

  // Every time we post to Slack, we also post to Teams
  const TEAMS_WEBHOOK_URL = 'https://prod-56.westus.logic.azure.com/workflows/e919a09e961c4508bb371908b28f838f/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=oONbkzMAtDtUbh96DPmJ72mHXTcIN1o9Kj6hS-QrfCA'
  try {
    await axios.post(
      TEAMS_WEBHOOK_URL,
      { text: message },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('Teams message successfully posted!');
  } catch (error) {
    console.error('Error posting to Teams:', error);
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
    if (surveyId === QUALTRICS_ADULT_MINDSET_SURVEY_ID) {
      const data = res.data.result.values;
      const athleteName = data.QID9_TEXT;
      const email = data.QID12_TEXT;
      const recordedDate = data.recordedDate;
      const level = data.Level;
      const providerName = res.data.result.labels?.QID11;
      const language = data.Q_Language;

      const growthMindsetPercentile = data.GP;
      const growthMindsetPercentileCollege = data.GMColComparison;
      const growthMindsetPercentilePro = data.GMProComparison;

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

      const growthMindsetScore = data.GrowthScore;
      const mentalSkillsScore = data.MentalSkills;
      const teamSupportScore = data.Team;
      const healthHabitsScore = data.HealthHabits;
      const selfReflectionScore = data.SelfReflection;

      // const slackMessage = `*New Qualtrics response fetched:*\n\nSurvey ID: ${surveyId}\nResponse ID: ${responseId}\nLevel: ${level}\n\nGrowth Mindset Percentile: ${growthMindsetPercentile}\nMental Skills Percentile: ${mentalSkillsPercentile}\nTeam Support Percentile: ${teamSupportPercentile}\nHealth Habits Percentile: ${healthHabitsPercentile}\nSelf Reflection Percentile: ${selfReflectionPercentile}\n`;
      // postToSlack(slackMessage);

      const result = {
        athleteName,
        email,
        recordedDate,
        level,
        providerName,
        language,
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
        growthMindsetScore,
        mentalSkillsScore,
        teamSupportScore,
        healthHabitsScore,
        selfReflectionScore,
      }

      console.log('Successfully fetched Qualtrics data - returning:');
      console.log(result)

      return result;
    } else if (surveyId === QUALTRICS_YOUTH_MINDSET_SURVEY_ID || surveyId === QUALTRICS_YOUTH_MINDSET_GOLF_SURVEY_ID) {
      const data = res.data.result.values;
      const athleteName = data.QID7_TEXT;
      const email = data.QID8_TEXT;
      const recordedDate = data.recordedDate;
      const age = data['Age'];
      const providerName = data['provider_name'];
      const sports = res.data.result.labels?.QID12;

      const growthMindsetPercentile = data['GM Percentile'];
      const selfConfidencePercentile = data['SC Percentile'];
      const teamCulturePercentile = data['TC Percentile'];
      const healthBehaviorsPercentile = data['HB Percentile'];
      const growthMindsetScore = data['Growth Mindset Score'];
      const selfConfidenceScore = data['Self Confidence Score'];
      const teamCultureScore = data['Team Culture Score'];
      const healthBehaviorsScore = data['Health Behaviors Score'];

      const result = {
        athleteName,
        email,
        recordedDate,
        age,
        providerName,
        growthMindsetPercentile,
        selfConfidencePercentile,
        teamCulturePercentile,
        healthBehaviorsPercentile,
        growthMindsetScore,
        selfConfidenceScore,
        teamCultureScore,
        healthBehaviorsScore,
        sports,
      }

      console.log('Successfully fetched Qualtrics data - returning:');
      console.log(result)

      return result;
    } else if (surveyId === QUALTRICS_STAFF_MINDSET_SURVEY_ID) {
      const data = res.data.result.values;
      const athleteName = data.Name;
      const email = data.QID3_TEXT;
      const recordedDate = data.recordedDate;
      const providerName = res.data.result.labels?.QID17;

      const performanceMindsetPercentile = data['PM Percentile'];
      const mindfulIntentionPercentile = data['MI Percentile'];
      const recoveryPercentile = data['R Percentile'];
      const teamCulturePercentile = data['TC Percentile'];
      const relationalDynamicsPercentile = data['RI Percentile'];
      const performanceMindsetScore = data['Performance Mindset'];
      const mindfulIntentionScore = data['Mindful Intention'];
      const recoveryScore = data['Recovery'];
      const teamCultureScore = data['Team Culture'];
      const relationalDynamicsScore = data['Relational Intelligence'];

      const result = {
        athleteName,
        email,
        recordedDate,
        providerName,
        performanceMindsetPercentile,
        mindfulIntentionPercentile,
        recoveryPercentile,
        teamCulturePercentile,
        relationalDynamicsPercentile,
        performanceMindsetScore,
        mindfulIntentionScore,
        recoveryScore,
        teamCultureScore,
        relationalDynamicsScore,
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

const uploadToS3 = async (surveyId, responseId) => {
  const REGION = "us-east-1";
  const s3Client = new S3Client({
    region: REGION,
  });

  let BUCKET_NAME = '';
  if (surveyId === QUALTRICS_ADULT_MINDSET_SURVEY_ID) {
    BUCKET_NAME = 'psp-mindset-assessment-reports';
  } else if (surveyId === QUALTRICS_YOUTH_MINDSET_SURVEY_ID) {
    BUCKET_NAME = 'psp-mindset-assessment-reports-youth';
  } else if (surveyId === QUALTRICS_STAFF_MINDSET_SURVEY_ID) {
    BUCKET_NAME = 'psp-mindset-assessment-reports-staff'
  } else if (surveyId === QUALTRICS_YOUTH_MINDSET_GOLF_SURVEY_ID) {
    BUCKET_NAME = 'psp-mindset-assessment-reports-youth-golf';
  }
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

const emailReport = async (surveyId, athleteName, providerName, reportUrl, email, language) => {
  let data = null;

  if (surveyId === QUALTRICS_ADULT_MINDSET_SURVEY_ID && language === QUALTRICS_SPANISH_LANGUAGE_CODE) {
    data = {
      from: "Premier Sport Psychology <mindset@premiersportpsychology.com>",
      to: email,
      subject: "Los resultados de su evaluación de mentalidad de Premier Sport Psychology",
      html: `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Los resultados de su evaluación de mentalidad de Premier Sport Psychology</title>
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
    <span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">Your Mindset Assessment Results from Premier Sport Psychology</span>
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
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Hola ${athleteName},</p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                          Gracias por completar la Evaluación de mentalidad de Premier Sport Psychology. Esta evaluación está diseñada para evaluar sus comportamientos, pensamientos y sentimientos relacionados con su bienestar y desempeño como atleta. También es un paso importante en el camino hacia un mejor rendimiento mental.
                        </p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                          Descargue su informe a continuación para ver sus puntuaciones y compararlas con las de otros atletas de su nivel. Le recomendamos que comparta estos resultados con sus entrenadores, proveedor de psicología deportiva u otras personas en su vida que están trabajando para apoyar su éxito.
                        </p>
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="btn btn-primary" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; box-sizing: border-box; width: 100%;" width="100%">
                          <tbody>
                            <tr>
                              <td align="left" style="font-family: sans-serif; font-size: 14px; vertical-align: top; padding-bottom: 15px;" valign="top">
                                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: auto;">
                                  <tbody>
                                    <tr>
                                      <td style="font-family: sans-serif; font-size: 14px; vertical-align: top; border-radius: 5px; text-align: center; background-color: #3498db;" valign="top" align="center" bgcolor="#3498db"> <a href="${reportUrl}" target="_blank" style="border: solid 1px #3498db; border-radius: 5px; box-sizing: border-box; cursor: pointer; display: inline-block; font-size: 14px; font-weight: bold; margin: 0; padding: 12px 25px; text-decoration: none; text-transform: capitalize; background-color: #3498db; border-color: #3498db; color: #ffffff;">Descargue su informe</a> </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
                          ¿Estás interesado en aprender más sobre la mentalidad del deportista y la psicología del deporte? ¡Contamos con un equipo dedicado de profesionales listos para ayudar! <a href='https://premiersportpsychology.com/'>Nuestra web</a> incluye recursos e información sobre psicología del deporte, así como un enlace para <a href='https://premiersportpsychology.com/request-appointment/'>solicitar cita previa</a>. ¡Menciona que tomaste la Evaluación de Mentalidad con $20 de descuento en tu primera sesión!
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
      text: `Hola {athleteName},\n\nGracias por completar la Evaluación de mentalidad de Premier Sport Psychology. Esta evaluación está diseñada para evaluar sus comportamientos, pensamientos y sentimientos relacionados con su bienestar y desempeño como atleta. También es un paso importante en el camino hacia un mejor rendimiento mental.
      \n\nDescargue su informe a continuación para ver sus puntuaciones y compararlas con las de otros atletas de su nivel. Le recomendamos que comparta estos resultados con sus entrenadores, proveedor de psicología deportiva u otras personas en su vida que están trabajando para apoyar su éxito.
      \n\nDescargue su informe: ${reportUrl}\n\n¿Estás interesado en aprender más sobre la mentalidad del deportista y la psicología del deporte? ¡Contamos con un equipo dedicado de profesionales listos para ayudar! Nuestra web (https://premiersportpsychology.com/) incluye recursos e información sobre psicología del deporte, así como un enlace para solicitar cita previa (https://premiersportpsychology.com/request-appointment/). ¡Menciona que tomaste la Evaluación de Mentalidad con $20 de descuento en tu primera sesión!`,
    };
  } else if (surveyId === QUALTRICS_ADULT_MINDSET_SURVEY_ID) {
    data = {
      from: "Premier Sport Psychology <mindset@premiersportpsychology.com>",
      to: email,
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
    <span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">Your Mindset Assessment Results from Premier Sport Psychology</span>
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
                          Are you interested in learning more about the athlete mindset and sport psychology? We have a dedicated team of professionals ready to help! <a href='https://premiersportpsychology.com/'>Our website</a> includes resources and information about sport psychology, as well as a link to <a href='https://premiersportpsychology.com/request-appointment/'>request an appointment</a>.
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
      text: `Hi {athleteName},\n\nThank you for completing Premier Sport Psychology’s Mindset Assessment. This assessment is designed to assess your behaviors, thoughts, and feelings related to your wellness and performance as an athlete. It is also an important step on the road to improved mental performance.\n\nPlease download your report below to view your scores and how they compare to other athletes at your level. We encourage you to share these results with your coaches, sport psychology provider, or others in your life who are working to support your success.\n\nDownload your report: ${reportUrl}\n\nAre you interested in learning more about the athlete mindset and sport psychology? We have a dedicated team of professionals ready to help! Our website (https://premiersportpsychology.com/) includes resources and information about sport psychology, as well as a link to request an appointment (https://premiersportpsychology.com/request-appointment/).`,
    };
  } else if (surveyId === QUALTRICS_YOUTH_MINDSET_SURVEY_ID || surveyId === QUALTRICS_YOUTH_MINDSET_GOLF_SURVEY_ID) {
    data = {
      from: "Premier Sport Psychology <mindset@premiersportpsychology.com>",
      to: email,
      subject: "Your Youth Mindset Assessment Results from Premier Sport Psychology",
      html: `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Your Youth Mindset Assessment Results from Premier Sport Psychology</title>
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
    <span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">Your Mindset Assessment Results from Premier Sport Psychology</span>
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
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Thank you for completing Premier Sport Psychology’s Mindset Assessment for youth athletes. This assessment is designed to assess your behaviors, thoughts, and feelings related to your wellness and performance as an athlete. It is also an important step on the road to improved mental performance.
                        </p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Please use the link below to download your report. This report will show you your scores and how they compare to other athletes at your level. We encourage you to share these results with your coaches, sport psychology provider, or others in your life who are working to support your success.</p>
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
                          Are you interested in learning more about the athlete mindset and sport psychology? We have a dedicated team of professionals ready to help! <a href='https://premiersportpsychology.com/'>Our website</a> includes resources and information about sport psychology, as well as a link to <a href='https://premiersportpsychology.com/request-appointment/'>request an appointment</a>.
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
      text: `Hi {athleteName},\n\nThank you for completing Premier Sport Psychology’s Mindset Assessment for youth athletes. This assessment is designed to assess your behaviors, thoughts, and feelings related to your wellness and performance as an athlete. It is also an important step on the road to improved mental performance.\n\nPlease use the link below to download your report. This report will show you your scores and how they compare to other athletes at your level. We encourage you to share these results with your coaches, sport psychology provider, or others in your life who are working to support your success.\n\nDownload your report: ${reportUrl}\n\nAre you interested in learning more about the athlete mindset and sport psychology? We have a dedicated team of professionals ready to help! Our website (https://premiersportpsychology.com/) includes resources and information about sport psychology, as well as a link to request an appointment (https://premiersportpsychology.com/request-appointment/).`,
    };
  } else if (surveyId === QUALTRICS_STAFF_MINDSET_SURVEY_ID) {
    data = {
      from: "Premier Sport Psychology <mindset@premiersportpsychology.com>",
      to: email,
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
    <span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">Your Mindset Assessment Results from Premier Sport Psychology</span>
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
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Thank you for completing Premier Sport Psychology’s Mindset Assessment for Sport Staff. This assessment is designed to assess your behaviors, thoughts, and feelings related to your wellness and development as someone who works in the sport industry. It is also an important step on the road to improved mental performance.
                        </p>
                        <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Please download your report below to view your scores and how they compare to other sport staff at your level. We encourage you to share these results with your supervisors, sport psychology provider, or others in your life who are working to support your success.</p>
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
                          Are you interested in learning more about sport psychology? We have a dedicated team of professionals ready to help! <a href='https://premiersportpsychology.com/'>Our website</a> includes resources and information about sport psychology, as well as a link to <a href='https://premiersportpsychology.com/request-appointment/'>request an appointment</a>.
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
      text: `Hi {athleteName},\n\nThank you for completing Premier Sport Psychology’s Mindset Assessment for Sport Staff. This assessment is designed to assess your behaviors, thoughts, and feelings related to your wellness and development as someone who works in the sport industry. It is also an important step on the road to improved mental performance. Please see the link below to download your report. This report will show you your scores and how they compare to other sport staff at your level. We encourage you to share these results with your supervisors, sport psychology provider, or others in your life who are working to support your success.\n\nDownload your report: ${reportUrl}\n\nAre you interested in learning more about sport psychology? We have a dedicated team of professionals ready to help! Our website (https://premiersportpsychology.com/) includes resources and information about sport psychology, as well as a link to request an appointment (https://premiersportpsychology.com/request-appointment/).`,
    };
  }

  if (data) {
    mailgun.messages().send(data, function(error, body) {
      if (error) {
        console.error(error);
        throw Error(error);
      } else {
        console.log(body);
      }
    });
  }

  // Sends email to provider if applicable
  const providerNameToEmailMap = {
    "Dr. Justin Anderson": "janderson@premiersportpsychology.com",
    "Dr. Carly Anderson": "canderson@premiersportpsychology.com",
    "Carlos Coto": "ccoto@premiersportpsychology.com",
    "Dr. Adam Gallenberg": "agallenberg@premiersportpsychology.com",
    "Dr. Ben Merkling": "bmerkling@premiersportpsychology.com",
    "Dr. Matthew Mikesell": "mmikesell@premiersportpsychology.com",
    "Nate Penz": "npenz@premiersportpsychology.com",
    "Alexandra Wulbecker-Smith": "awulbeckersmith@premiersportpsychology.com",
    "Dr. Chrissy Holm-Haider": "ccholm@premiersportpsychology.com",
    "Dr. Janet Finlayson": "jfinlayson@premiersportpsychology.com",
    "Dr. Kirbi Kidd": "kkidd@premiersportpsychology.com",
    "Dr. Phil Imholte": "pimholte@premiersportpsychology.com",
    "Dr. McKenzie Bromback": "mbromback@premiersportpsychology.com",
    "Eiron Sanchez": "esanchez@premiersportpsychology.com",
    "Luis Torres": "ltorres@premiersportpsychology.com",
    "Dr. Harlan Austin": "haustin@premiersportpsychology.com",
    "Dr. Lauren Zimmerman": "lzimmerman@premiersportpsychology.com",
    "Canon Pieper": "cpieper@premiersportpsychology.com",
    "Dr. Carlosjavier Sanchez": "csanchez@premiersportpsychology.com",
  }

  if (providerName && providerName in providerNameToEmailMap) {
    const providerEmail = providerNameToEmailMap[providerName];

    const dataProviderEmail = {
      from: "Premier Sport Psychology <mindset@premiersportpsychology.com>",
      to: providerEmail,
      bcc: 'admin@premiersportpsychology.com',
      subject: `Mindset Assessment Result for ${athleteName}`,
      html: `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Mindset Assessment Result for ${athleteName}</title>
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
  <span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">Mindset Assessment Result for ${athleteName}</span>
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
                      <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Hi ${providerName},</p>
                      <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Your athlete, ${athleteName}, recently completed a Mindset Assessment. You can download their report below.</p>
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="btn btn-primary" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; box-sizing: border-box; width: 100%;" width="100%">
                        <tbody>
                          <tr>
                            <td align="left" style="font-family: sans-serif; font-size: 14px; vertical-align: top; padding-bottom: 15px;" valign="top">
                              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: auto;">
                                <tbody>
                                  <tr>
                                    <td style="font-family: sans-serif; font-size: 14px; vertical-align: top; border-radius: 5px; text-align: center; background-color: #3498db;" valign="top" align="center" bgcolor="#3498db"> <a href="${reportUrl}" target="_blank" style="border: solid 1px #3498db; border-radius: 5px; box-sizing: border-box; cursor: pointer; display: inline-block; font-size: 14px; font-weight: bold; margin: 0; padding: 12px 25px; text-decoration: none; text-transform: capitalize; background-color: #3498db; border-color: #3498db; color: #ffffff;">Download report</a> </td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
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
      text: `Hi {providerName},\n\nYour athlete, ${athleteName}, recently completed a Mindset Assessment. You can download their report here: ${reportUrl}.`,
    };

    mailgun.messages().send(dataProviderEmail, function(error, body) {
      if (error) {
        console.error(error);
        throw Error(error);
      } else {
        console.log(body);
      }
    });
  }
}

// Consumes Qualtrics webhook for Adult Mindset Report
app.post('/generate_report', (req, res) => {
  console.log('Webhook listener received for Adult Mindset Report - request body:')
  console.log(req.body);

  // Send a 200 status code to acknowledge receiving the webhook
  res.status(200).end();

  const surveyId = req.body['SurveyID'];
  const responseId = req.body['ResponseID'];
  const responseTimestamp = req.body['CompletedDate'];

  const slackMessage = `*New Qualtrics response received (Adult Mindset):*\n\nSurvey ID: ${surveyId}\nResponse ID: ${responseId}\nTimestamp: ${responseTimestamp}`;
  postToSlack(slackMessage);

  if (surveyId === QUALTRICS_ADULT_MINDSET_SURVEY_ID) {
    getQualtricsResponse(surveyId, responseId)
    .then((qualtricsData) => {
      const {
        athleteName,
        email,
        recordedDate,
        level,
        providerName,
        language,
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
        growthMindsetScore,
        mentalSkillsScore,
        teamSupportScore,
        healthHabitsScore,
        selfReflectionScore,
      } = qualtricsData;
  
      const urlParams = {
        reportOnly: 'true',
        athleteName,
        recordedDate,
        level,
        language: language === QUALTRICS_SPANISH_LANGUAGE_CODE ? 'es' : 'en',
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
        growthMindsetScore,
        mentalSkillsScore,
        teamSupportScore,
        healthHabitsScore,
        selfReflectionScore,
      }
      const url = 'https://psp-backend.fly.dev/?' + querystring.stringify(urlParams);
  
      generatePdfReport(url, responseId)
      .then(() => {
        uploadToS3(surveyId, responseId)
        .then(reportUrl => {
          console.log(`Successful upload to S3! Presigned URL: ${reportUrl}`);
          emailReport(surveyId, athleteName, providerName, reportUrl, email, language)
          .then(() => {
            console.log('All steps completed!');
            const slackMessage = `*Email with report delivered (Adult Mindset):*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
            postToSlack(slackMessage);
          })
          .catch(error => {
            console.error(error);
            const slackMessage = `*Failed to send email with report:*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
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

app.post('/generate_report_youth_mindset', (req, res) => {
  console.log('Webhook listener received for Youth Mindset Report - request body:')
  console.log(req.body);

  // Send a 200 status code to acknowledge receiving the webhook
  res.status(200).end();

  const surveyId = req.body['SurveyID'];
  const responseId = req.body['ResponseID'];
  const responseTimestamp = req.body['CompletedDate'];

  const slackMessage = `*New Qualtrics response received (Youth Mindset):*\n\nSurvey ID: ${surveyId}\nResponse ID: ${responseId}\nTimestamp: ${responseTimestamp}`;
  postToSlack(slackMessage);

  if (surveyId === QUALTRICS_YOUTH_MINDSET_SURVEY_ID) {
    getQualtricsResponse(surveyId, responseId)
    .then((qualtricsData) => {
      const {
        athleteName,
        email,
        recordedDate,
        age,
        providerName,
        growthMindsetPercentile,
        selfConfidencePercentile,
        teamCulturePercentile,
        healthBehaviorsPercentile,
        growthMindsetScore,
        selfConfidenceScore,
        teamCultureScore,
        healthBehaviorsScore,
        sports,
      } = qualtricsData;

      // TODO: Update this once language is dynamic
      const language = 'en';
      const isHockeyReport = sports && sports.includes(QUALTRICS_HOCKEY_CODE);
  
      const urlParams = {
        reportOnly: 'true',
        athleteName,
        recordedDate,
        age,
        language,
        growthMindsetPercentile: growthMindsetPercentile.replace('%', ''),
        selfConfidencePercentile: selfConfidencePercentile.replace('%', ''),
        teamCulturePercentile: teamCulturePercentile.replace('%', ''),
        healthBehaviorsPercentile: healthBehaviorsPercentile.replace('%', ''),
        growthMindsetScore,
        selfConfidenceScore,
        teamCultureScore,
        healthBehaviorsScore,
        sport: isHockeyReport ? 'hockey' : '',
      }
      const url = 'https://psp-backend.fly.dev/youth/?' + querystring.stringify(urlParams);
  
      generatePdfReport(url, responseId)
      .then(() => {
        uploadToS3(surveyId, responseId)
        .then(reportUrl => {
          console.log(`Successful upload to S3! Presigned URL: ${reportUrl}`);
          emailReport(surveyId, athleteName, providerName, reportUrl, email, language)
          .then(() => {
            console.log('All steps completed!');
            let slackMessage = '';
            if (isHockeyReport) {
              slackMessage = `*Email with report delivered (Youth Mindset - Hockey):*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
            } else {
              slackMessage = `*Email with report delivered (Youth Mindset):*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
            }
            postToSlack(slackMessage);
          })
          .catch(error => {
            console.error(error);
            const slackMessage = `*Failed to send email with report:*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
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

app.post('/generate_report_youth_golf_mindset', (req, res) => {
  console.log('Webhook listener received for Youth Mindset Golf Report - request body:')
  console.log(req.body);

  // Send a 200 status code to acknowledge receiving the webhook
  res.status(200).end();

  const surveyId = req.body['SurveyID'];
  const responseId = req.body['ResponseID'];
  const responseTimestamp = req.body['CompletedDate'];

  const slackMessage = `*New Qualtrics response received (Youth Mindset Golf):*\n\nSurvey ID: ${surveyId}\nResponse ID: ${responseId}\nTimestamp: ${responseTimestamp}`;
  postToSlack(slackMessage);

  if (surveyId === QUALTRICS_YOUTH_MINDSET_GOLF_SURVEY_ID) {
    getQualtricsResponse(surveyId, responseId)
    .then((qualtricsData) => {
      const {
        athleteName,
        email,
        recordedDate,
        age,
        providerName,
        growthMindsetPercentile,
        selfConfidencePercentile,
        teamCulturePercentile,
        healthBehaviorsPercentile,
        growthMindsetScore,
        selfConfidenceScore,
        teamCultureScore,
        healthBehaviorsScore,
      } = qualtricsData;

      // TODO: Update this once language is dynamic
      const language = 'en';
  
      const urlParams = {
        reportOnly: 'true',
        athleteName,
        recordedDate,
        age,
        language,
        growthMindsetPercentile: growthMindsetPercentile.replace('%', ''),
        selfConfidencePercentile: selfConfidencePercentile.replace('%', ''),
        teamCulturePercentile: teamCulturePercentile.replace('%', ''),
        healthBehaviorsPercentile: healthBehaviorsPercentile.replace('%', ''),
        growthMindsetScore,
        selfConfidenceScore,
        teamCultureScore,
        healthBehaviorsScore,
      }
      const url = 'https://psp-backend.fly.dev/youth-golf/?' + querystring.stringify(urlParams);
  
      generatePdfReport(url, responseId)
      .then(() => {
        uploadToS3(surveyId, responseId)
        .then(reportUrl => {
          console.log(`Successful upload to S3! Presigned URL: ${reportUrl}`);
          emailReport(surveyId, athleteName, providerName, reportUrl, email, language)
          .then(() => {
            console.log('All steps completed!');
            const slackMessage = `*Email with report delivered (Youth Mindset Golf):*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
            postToSlack(slackMessage);
          })
          .catch(error => {
            console.error(error);
            const slackMessage = `*Failed to send email with report:*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
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

app.post('/generate_report_staff_mindset', (req, res) => {
  console.log('Webhook listener received for Staff Mindset Report - request body:')
  console.log(req.body);

  // Send a 200 status code to acknowledge receiving the webhook
  res.status(200).end();

  const surveyId = req.body['SurveyID'];
  const responseId = req.body['ResponseID'];
  const responseTimestamp = req.body['CompletedDate'];

  const slackMessage = `*New Qualtrics response received (Staff Mindset):*\n\nSurvey ID: ${surveyId}\nResponse ID: ${responseId}\nTimestamp: ${responseTimestamp}`;
  postToSlack(slackMessage);

  if (surveyId === QUALTRICS_STAFF_MINDSET_SURVEY_ID) {
    getQualtricsResponse(surveyId, responseId)
    .then((qualtricsData) => {
      const {
        athleteName,
        email,
        recordedDate,
        providerName,
        performanceMindsetPercentile,
        mindfulIntentionPercentile,
        recoveryPercentile,
        teamCulturePercentile,
        relationalDynamicsPercentile,
        performanceMindsetScore,
        mindfulIntentionScore,
        recoveryScore,
        teamCultureScore,
        relationalDynamicsScore,
      } = qualtricsData;

      // TODO: Update this once language is dynamic
      const language = 'en';
  
      const urlParams = {
        reportOnly: 'true',
        athleteName,
        recordedDate,
        language,
        performanceMindsetPercentile: performanceMindsetPercentile.replace('%', ''),
        mindfulIntentionPercentile: mindfulIntentionPercentile.replace('%', ''),
        recoveryPercentile: recoveryPercentile.replace('%', ''),
        teamCulturePercentile: teamCulturePercentile.replace('%', ''),
        relationalDynamicsPercentile: relationalDynamicsPercentile.replace('%', ''),
        relationalDynamicsPercentile,
        performanceMindsetScore,
        mindfulIntentionScore,
        recoveryScore,
        teamCultureScore,
        relationalDynamicsScore,
      }
      const url = 'https://psp-backend.fly.dev/staff/?' + querystring.stringify(urlParams);
  
      generatePdfReport(url, responseId)
      .then(() => {
        uploadToS3(surveyId, responseId)
        .then(reportUrl => {
          console.log(`Successful upload to S3! Presigned URL: ${reportUrl}`);
          emailReport(surveyId, athleteName, providerName, reportUrl, email, language)
          .then(() => {
            console.log('All steps completed!');
            const slackMessage = `*Email with report delivered (Staff Mindset):*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
            postToSlack(slackMessage);
          })
          .catch(error => {
            console.error(error);
            const slackMessage = `*Failed to send email with report:*\n\nResponse ID: ${responseId}\nEmail: ${email}\nLanguage: ${language}\nReport URL: ${reportUrl}`;
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